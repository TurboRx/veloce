//go:build embedweb
// +build embedweb

package veloceweb

import (
	"embed"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strings"
	"time"
)

//go:embed all:out
var OutFS embed.FS

var dynamicRouteParamRE = regexp.MustCompile(`\\\[(\w+)\\\]`)
var dynamicRouteCatchAllRE = regexp.MustCompile(`\\\[\.\.\.(\w+)\\\]`)

type Route struct {
	RoutePattern *regexp.Regexp
	FilePath     string
}

type staticWebHandler struct {
	f      fs.FS
	routes []Route
}

func NewHandler() (http.Handler, error) {
	subFS, err := fs.Sub(OutFS, "out")
	if err != nil {
		return nil, err
	}

	routes := make([]Route, 0)
	err = fs.WalkDir(subFS, ".", func(path string, d fs.DirEntry, err error) error {
		if strings.HasSuffix(path, ".html") {
			route := strings.TrimSuffix(path, ".html")
			route = regexp.QuoteMeta(route)

			route = dynamicRouteParamRE.ReplaceAllString(route, "[a-zA-Z0-9_.=-]+")
			route = dynamicRouteCatchAllRE.ReplaceAllString(route, "[a-zA-Z0-9_.=/-]+")

			route = "^" + route + "$"

			routes = append(routes, Route{
				RoutePattern: regexp.MustCompile(route),
				FilePath:     path,
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	slices.SortFunc(routes, func(i, j Route) int {
		a := strings.Index(i.FilePath, "[")
		b := strings.Index(j.FilePath, "[")

		if a == -1 && b == -1 {
			return 0
		}
		if a == -1 {
			return -1
		}
		if b == -1 {
			return 1
		}
		return b - a
	})

	return &staticWebHandler{
		f:      subFS,
		routes: routes,
	}, nil
}

func (h *staticWebHandler) ServeHTTP(res http.ResponseWriter, req *http.Request) {
	if strings.HasSuffix(req.URL.Path, ".html") {
		newPath := strings.TrimSuffix(req.URL.Path, ".html")
		http.Redirect(res, req, newPath, http.StatusMovedPermanently)
		return
	}

	path := strings.Trim(req.URL.Path, "/")
	if path == "" {
		http.ServeFileFS(res, req, h.f, "index.html")
		return
	}

	f, err := h.f.Open(path)
	if err == nil {
		stat, err := f.Stat()
		if err != nil {
			http.Error(res, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		if !stat.IsDir() {
			http.ServeContent(res, req, path, time.Now(), f.(io.ReadSeeker))
			return
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		http.Error(res, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	for _, r := range h.routes {
		if r.RoutePattern.MatchString(path) {
			f, err := h.f.Open(r.FilePath)
			if err != nil {
				if errors.Is(err, os.ErrNotExist) {
					http.NotFound(res, req)
					return
				}
				http.Error(res, "Internal Server Error", http.StatusInternalServerError)
				return
			}

			http.ServeContent(res, req, r.FilePath, time.Now(), f.(io.ReadSeeker))
			return
		}
	}

	http.ServeFileFS(res, req, h.f, "404.html")
}
