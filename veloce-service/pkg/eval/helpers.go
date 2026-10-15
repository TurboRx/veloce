package eval

import (
	"context"
	"time"
)

// proxyContext wraps context.Context to restrict unauthorized access to custom context methods.
type proxyContext struct {
	ctx context.Context
}

func (sc proxyContext) Deadline() (time.Time, bool) {
	return sc.ctx.Deadline()
}

func (sc proxyContext) Done() <-chan struct{} {
	return sc.ctx.Done()
}

func (sc proxyContext) Err() error {
	return sc.ctx.Err()
}

func (sc proxyContext) Value(key any) any {
	return sc.ctx.Value(key)
}
