package thing

import (
	"encoding/json"
	"testing"

	"github.com/diamondburned/arikawa/v3/discord"
)

func TestThingPrimitives(t *testing.T) {
	s := NewString("hello")
	if s.String() != "hello" {
		t.Fatalf("expected hello, got %s", s.String())
	}
	if s.Type != TypeString {
		t.Fatalf("expected TypeString, got %s", s.Type)
	}

	i := NewInt(42)
	if i.Int() != 42 {
		t.Fatalf("expected 42, got %d", i.Int())
	}
	if i.Float() != 42.0 {
		t.Fatalf("expected 42.0, got %f", i.Float())
	}
	if i.String() != "42" {
		t.Fatalf("expected '42', got %s", i.String())
	}

	fl := NewFloat(3.14)
	if fl.Float() != 3.14 {
		t.Fatalf("expected 3.14, got %f", fl.Float())
	}

	b := NewBool(true)
	if !b.Bool() {
		t.Fatal("expected true")
	}

	bFalse := NewBool(false)
	if bFalse.Bool() {
		t.Fatal("expected false")
	}
}

func TestThingGuessType(t *testing.T) {
	guessStr := NewGuessTypeWithFallback("test-string")
	if guessStr.Type != TypeString {
		t.Fatalf("expected TypeString, got %s", guessStr.Type)
	}

	guessInt := NewGuessTypeWithFallback(123)
	if guessInt.Type != TypeInt {
		t.Fatalf("expected TypeInt, got %s", guessInt.Type)
	}

	guessBool := NewGuessTypeWithFallback(true)
	if guessBool.Type != TypeBool {
		t.Fatalf("expected TypeBool, got %s", guessBool.Type)
	}
}

func TestThingDiscordEntities(t *testing.T) {
	user := discord.User{
		ID:       discord.UserID(987654321),
		Username: "TestUser",
	}
	uThing := NewDiscordUser(user)
	if !uThing.IsDiscordEntity() {
		t.Fatal("expected user to be a Discord entity")
	}
	if uThing.Snowflake() != discord.Snowflake(987654321) {
		t.Fatalf("expected snowflake 987654321, got %d", uThing.Snowflake())
	}
	if uThing.String() != "<@987654321>" {
		t.Fatalf("expected mention, got %s", uThing.String())
	}

	channel := discord.Channel{
		ID:   discord.ChannelID(111222333),
		Name: "general",
	}
	cThing := NewDiscordChannel(channel)
	if cThing.Snowflake() != discord.Snowflake(111222333) {
		t.Fatalf("expected snowflake 111222333, got %d", cThing.Snowflake())
	}
}

func TestThingJSON(t *testing.T) {
	orig := NewString("json-value")
	bytes, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("failed to marshal thing: %v", err)
	}

	var unmarshaled Thing
	if err := json.Unmarshal(bytes, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal thing: %v", err)
	}

	if unmarshaled.String() != "json-value" {
		t.Fatalf("expected 'json-value', got %s", unmarshaled.String())
	}
	if unmarshaled.Type != TypeString {
		t.Fatalf("expected TypeString, got %s", unmarshaled.Type)
	}
}

func TestThingComparisons(t *testing.T) {
	t1 := NewInt(10)
	t2 := NewInt(20)

	if !t1.LessThan(&t2) {
		t.Fatal("expected t1 < t2")
	}
	if !t2.GreaterThan(&t1) {
		t.Fatal("expected t2 > t1")
	}

	s1 := NewString("Discord Bot Builder")
	s2 := NewString("Bot")
	if !s1.Contains(&s2) {
		t.Fatal("expected s1 to contain s2")
	}
}
