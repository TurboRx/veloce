package eval

import (
	"context"
	"strings"
	"testing"

	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/gateway"
)

func TestEvalExpressions(t *testing.T) {
	ctx := context.Background()

	c := Context{
		Env: Env{
			"a": 10,
			"b": 20,
			"user": &UserEnv{
				ID:       "123456",
				Username: "DiscordWizard",
			},
		},
	}

	// Arithmetic
	res, err := Eval(ctx, "a + b", c)
	if err != nil {
		t.Fatalf("eval failed: %v", err)
	}
	if res.Int() != 30 {
		t.Fatalf("expected 30, got %d", res.Int())
	}

	// String expression
	resStr, err := Eval(ctx, "'Hello ' + user.username", c)
	if err != nil {
		t.Fatalf("eval failed: %v", err)
	}
	if resStr.String() != "Hello DiscordWizard" {
		t.Fatalf("expected 'Hello DiscordWizard', got %s", resStr.String())
	}

	// Boolean comparison
	resBool, err := Eval(ctx, "a < b && user.id == '123456'", c)
	if err != nil {
		t.Fatalf("eval failed: %v", err)
	}
	if !resBool.Bool() {
		t.Fatal("expected true")
	}
}

func TestEvalLimits(t *testing.T) {
	ctx := context.Background()
	c := Context{Env: make(Env)}

	// Exceed MaxExpressionLength
	longExpr := strings.Repeat("1+", MaxExpressionLength) + "1"
	_, err := Eval(ctx, longExpr, c)
	if err == nil {
		t.Fatal("expected error on long expression, got nil")
	}

	// Exceed MaxTemplateLength
	longTemplate := strings.Repeat("x", MaxTemplateLength+1)
	_, err = EvalTemplate(ctx, longTemplate, c)
	if err == nil {
		t.Fatal("expected error on long template, got nil")
	}
}

func TestEvalTemplate(t *testing.T) {
	ctx := context.Background()

	c := Context{
		Env: Env{
			"user": &UserEnv{
				ID:       "999888",
				Username: "SuperDev",
				Mention:  "<@999888>",
			},
			"channel": &ChannelEnv{
				ID:      "111222",
				Name:    "announcements",
				Mention: "<#111222>",
			},
			"arg": func(name string) any {
				if name == "count" {
					return 5
				}
				return nil
			},
		},
	}

	// Multi-placeholder template
	tmpl := "Hey {{user.username}}, posted in {{channel.name}} with {{arg('count')}} items!"
	out, err := EvalTemplateToString(ctx, tmpl, c)
	if err != nil {
		t.Fatalf("failed to evaluate template: %v", err)
	}
	expected := "Hey SuperDev, posted in announcements with 5 items!"
	if out != expected {
		t.Fatalf("expected '%s', got '%s'", expected, out)
	}

	// Single placeholder preservation
	singleTmpl := "{{user}}"
	res, err := EvalTemplate(ctx, singleTmpl, c)
	if err != nil {
		t.Fatalf("failed to evaluate single template: %v", err)
	}
	if res.String() != "<@999888>" {
		t.Fatalf("expected mention, got %s", res.String())
	}
}

func TestInteractionContext(t *testing.T) {
	ctx := context.Background()

	interaction := &discord.InteractionEvent{
		ID: discord.InteractionID(55555),
		User: &discord.User{
			ID:       discord.UserID(12345),
			Username: "AdminUser",
		},
		Data: &discord.CommandInteraction{
			Name: "ban",
			Options: []discord.CommandInteractionOption{
				{
					Name:  "reason",
					Type:  discord.StringOptionType,
					Value: []byte(`"Spamming"`),
				},
			},
		},
	}

	c := NewContextFromInteraction(interaction, nil)

	res, err := EvalTemplateToString(ctx, "Action by {{user.username}} with reason: {{arg('reason')}}", c)
	if err != nil {
		t.Fatalf("eval failed: %v", err)
	}
	expected := "Action by AdminUser with reason: Spamming"
	if res != expected {
		t.Fatalf("expected '%s', got '%s'", expected, res)
	}
}

func TestEventContext(t *testing.T) {
	ctx := context.Background()

	msgEvent := &gateway.MessageCreateEvent{
		Message: discord.Message{
			ID:        discord.MessageID(99999),
			ChannelID: discord.ChannelID(88888),
			Content:   "Hello world",
			Author: discord.User{
				ID:       discord.UserID(77777),
				Username: "DiscordChatter",
			},
		},
	}

	c := NewContextFromGatewayEvent(msgEvent, nil)

	res, err := EvalTemplateToString(ctx, "Message: {{message.content}} from {{user.username}} in {{channel.id}}", c)
	if err != nil {
		t.Fatalf("eval failed: %v", err)
	}
	expected := "Message: Hello world from DiscordChatter in 88888"
	if res != expected {
		t.Fatalf("expected '%s', got '%s'", expected, res)
	}
}
