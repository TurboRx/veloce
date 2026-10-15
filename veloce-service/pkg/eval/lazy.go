package eval

import (
	"reflect"
	"slices"

	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/vm/runtime"
)

type lazyFielder interface {
	lazyField(name string) (any, bool, error)
}

var lazyFielderType = reflect.TypeOf((*lazyFielder)(nil)).Elem()

const fetchFieldFunc = "$fetch_field"

func patchOptions(patchers []ast.Visitor) []expr.Option {
	return []expr.Option{
		expr.Function(fetchFieldFunc, fetchField),
		expr.Patch(visitors(append(slices.Clip(patchers), fieldPatcher{}))),
	}
}

type visitors []ast.Visitor

func (v visitors) Visit(node *ast.Node) {
	for _, visitor := range v {
		visitor.Visit(node)
	}
}

type fieldPatcher struct{}

func (fieldPatcher) Visit(node *ast.Node) {
	member, ok := (*node).(*ast.MemberNode)
	if !ok || member.Method {
		return
	}

	_, named := member.Property.(*ast.StringNode)
	t := member.Node.Type()
	lazy := t == nil || t.Kind() == reflect.Interface || t.Implements(lazyFielderType)
	afterOptional := isOptionalFetch(member.Node)
	if !afterOptional && !(named && lazy) {
		return
	}

	ast.Patch(node, &ast.CallNode{
		Callee:    &ast.IdentifierNode{Value: fetchFieldFunc},
		Arguments: []ast.Node{member.Node, member.Property, &ast.BoolNode{Value: member.Optional || afterOptional}},
	})
}

func isOptionalFetch(node ast.Node) bool {
	call, ok := node.(*ast.CallNode)
	if !ok {
		return false
	}
	if callee, ok := call.Callee.(*ast.IdentifierNode); !ok || callee.Value != fetchFieldFunc {
		return false
	}
	optional, ok := call.Arguments[2].(*ast.BoolNode)
	return ok && optional.Value
}

func fetchField(params ...any) (any, error) {
	from, name, optional := params[0], params[1], params[2].(bool)

	if runtime.IsNil(from) {
		if optional {
			return nil, nil
		}
		if v := reflect.ValueOf(from); v.Kind() == reflect.Ptr && v.Type().Implements(lazyFielderType) {
			from = reflect.New(v.Type().Elem()).Interface()
		}
	}

	if l, ok := from.(lazyFielder); ok {
		if nameStr, ok := name.(string); ok {
			if v, ok, err := l.lazyField(nameStr); ok {
				return v, err
			}
		}
	}
	return runtime.Fetch(from, name), nil
}
