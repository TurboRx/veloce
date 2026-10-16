//go:build !embedweb
// +build !embedweb

package veloceweb

import (
	"fmt"
	"net/http"
)

func NewHandler() (http.Handler, error) {
	return nil, fmt.Errorf("website not embedded")
}
