package eval

import (
	"context"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"

	"github.com/TurboRx/veloce/veloce-service/pkg/thing"
	"github.com/expr-lang/expr"
	"github.com/valyala/fasttemplate"
)

const (
	templateStartTag = "{{"
	templateEndTag   = "}}"

	// MaxExpressionLength bounds a single expression handed to expr.Compile.
	MaxExpressionLength = 10_000

	// MaxTemplateLength bounds a whole template before its placeholders are evaluated.
	MaxTemplateLength = 100_000

	// MaxTemplateOutputLength bounds total expanded template output to 4MB.
	MaxTemplateOutputLength = 4 * 1024 * 1024
)

var (
	ErrExpressionTooLong     = errors.New("expression too long")
	ErrTemplateTooLong       = errors.New("template too long")
	ErrTemplateOutputTooLong = errors.New("template output too long")
)

// Eval compiles and executes an expression against the given evaluation context.
func Eval(ctx context.Context, expression string, c Context) (thing.Thing, error) {
	if len(expression) > MaxExpressionLength {
		return thing.Null, fmt.Errorf(
			"eval error: %w: %d characters, limit is %d",
			ErrExpressionTooLong, len(expression), MaxExpressionLength,
		)
	}

	if c.Env == nil {
		c.Env = make(Env)
	}
	c.Env["ctx"] = proxyContext{ctx: ctx}

	opts := []expr.Option{
		expr.Env(c.Env),
		expr.AllowUndefinedVariables(),
		expr.WithContext("ctx"),
		expr.Timezone("UTC"),
	}
	opts = append(opts, patchOptions(c.Patchers)...)

	program, err := expr.Compile(expression, opts...)
	if err != nil {
		return thing.Null, fmt.Errorf("eval error: %w", err)
	}

	result, err := expr.Run(program, map[string]any(c.Env))
	if err != nil {
		return thing.Null, fmt.Errorf("eval error: %w", err)
	}

	if v := reflect.ValueOf(result); v.Kind() == reflect.Ptr && v.IsNil() {
		result = nil
	}

	res := thing.NewGuessTypeWithFallback(result)
	return replaceNewlines(res), nil
}

// EvalTemplate evaluates templates with {{expression}} placeholders.
func EvalTemplate(ctx context.Context, template string, c Context) (thing.Thing, error) {
	return evalTemplate(ctx, template, c, false)
}

// EvalTemplateKeepSpace evaluates templates while preserving surrounding whitespace.
func EvalTemplateKeepSpace(ctx context.Context, template string, c Context) (thing.Thing, error) {
	return evalTemplate(ctx, template, c, true)
}

func evalTemplate(ctx context.Context, template string, c Context, keepSpace bool) (thing.Thing, error) {
	if len(template) > MaxTemplateLength {
		return thing.Null, fmt.Errorf(
			"eval error: %w: %d characters, limit is %d",
			ErrTemplateTooLong, len(template), MaxTemplateLength,
		)
	}

	trimmed := strings.TrimSpace(template)
	if !keepSpace {
		template = trimmed
	}
	if template == "" {
		return thing.Null, nil
	}

	// Fast path for single placeholder: preserve underlying object/type directly
	if strings.HasPrefix(trimmed, templateStartTag) &&
		strings.HasSuffix(trimmed, templateEndTag) &&
		strings.Count(trimmed, templateStartTag) == 1 &&
		strings.Count(trimmed, templateEndTag) == 1 {
		expression := trimmed[len(templateStartTag) : len(trimmed)-len(templateEndTag)]
		res, err := Eval(ctx, expression, c)
		if err != nil {
			return thing.Null, err
		}
		return res, nil
	}

	var emitted int
	res, err := fasttemplate.ExecuteFuncStringWithErr(
		template,
		templateStartTag,
		templateEndTag,
		func(w io.Writer, tag string) (int, error) {
			evalRes, err := Eval(ctx, tag, c)
			if err != nil {
				return 0, err
			}

			if evalRes.IsNil() {
				return w.Write([]byte(""))
			}

			val := evalRes.String()
			emitted += len(val)
			if emitted > MaxTemplateOutputLength {
				return 0, fmt.Errorf(
					"eval error: %w: expanded to at least %d bytes, limit is %d",
					ErrTemplateOutputTooLong, emitted, MaxTemplateOutputLength,
				)
			}

			return w.Write([]byte(val))
		},
	)
	if err != nil {
		return thing.Null, err
	}

	return thing.NewString(res), nil
}

// EvalTemplateToString evaluates a template directly to its string representation.
func EvalTemplateToString(ctx context.Context, template string, c Context) (string, error) {
	res, err := EvalTemplate(ctx, template, c)
	if err != nil {
		return "", err
	}
	if res.IsNil() {
		return "", nil
	}
	return res.String(), nil
}

func replaceNewlines(s thing.Thing) thing.Thing {
	if s.Type == thing.TypeString {
		str := s.String()
		var result strings.Builder
		result.Grow(len(str))

		runes := []rune(str)
		for i := 0; i < len(runes); i++ {
			if i < len(runes)-2 && runes[i] == '\\' && runes[i+1] == '\\' && runes[i+2] == 'n' {
				result.WriteString("\\n")
				i += 2
			} else if i < len(runes)-1 && runes[i] == '\\' && runes[i+1] == 'n' {
				result.WriteString("\n")
				i++
			} else {
				result.WriteRune(runes[i])
			}
		}
		return thing.NewString(result.String())
	}
	return s
}
