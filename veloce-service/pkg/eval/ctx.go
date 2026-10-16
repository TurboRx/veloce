package eval

import (
	"encoding/json"
	"strconv"

	"github.com/diamondburned/arikawa/v3/discord"
	"github.com/diamondburned/arikawa/v3/gateway"
	"github.com/diamondburned/arikawa/v3/state"
	"github.com/expr-lang/expr/ast"
)

type Context struct {
	Env      Env
	Patchers []ast.Visitor
}

type Env map[string]any

type UserEnv struct {
	ID            string `expr:"id" json:"id"`
	Username      string `expr:"username" json:"username"`
	Discriminator string `expr:"discriminator" json:"discriminator"`
	Avatar        string `expr:"avatar" json:"avatar"`
	Bot           bool   `expr:"bot" json:"bot"`
	Mention       string `expr:"mention" json:"mention"`
}

func (u *UserEnv) String() string {
	if u == nil {
		return ""
	}
	return u.Mention
}

func NewUserEnv(u discord.User) *UserEnv {
	avatar := ""
	if u.Avatar != "" {
		avatar = u.AvatarURL()
	}
	return &UserEnv{
		ID:            u.ID.String(),
		Username:      u.Username,
		Discriminator: u.Discriminator,
		Avatar:        avatar,
		Bot:           u.Bot,
		Mention:       u.Mention(),
	}
}

type MemberEnv struct {
	User     *UserEnv `expr:"user" json:"user"`
	Nick     string   `expr:"nick" json:"nick"`
	Roles    []string `expr:"roles" json:"roles"`
	JoinedAt string   `expr:"joined_at" json:"joined_at"`
	Mention  string   `expr:"mention" json:"mention"`
}

func (m *MemberEnv) String() string {
	if m == nil {
		return ""
	}
	return m.Mention
}

func NewMemberEnv(m discord.Member) *MemberEnv {
	roles := make([]string, len(m.RoleIDs))
	for i, r := range m.RoleIDs {
		roles[i] = r.String()
	}
	joinedAt := ""
	if m.Joined.IsValid() {
		joinedAt = m.Joined.Format(discord.TimestampFormat)
	}
	return &MemberEnv{
		User:     NewUserEnv(m.User),
		Nick:     m.Nick,
		Roles:    roles,
		JoinedAt: joinedAt,
		Mention:  m.Mention(),
	}
}

type ChannelEnv struct {
	ID      string `expr:"id" json:"id"`
	Name    string `expr:"name" json:"name"`
	Type    int    `expr:"type" json:"type"`
	Mention string `expr:"mention" json:"mention"`
}

func (c *ChannelEnv) String() string {
	if c == nil {
		return ""
	}
	return c.Mention
}

func NewChannelEnv(ch discord.Channel) *ChannelEnv {
	return &ChannelEnv{
		ID:      ch.ID.String(),
		Name:    ch.Name,
		Type:    int(ch.Type),
		Mention: ch.Mention(),
	}
}

type GuildEnv struct {
	ID          string `expr:"id" json:"id"`
	Name        string `expr:"name" json:"name"`
	Icon        string `expr:"icon" json:"icon"`
	MemberCount int    `expr:"member_count" json:"member_count"`
}

func (g *GuildEnv) String() string {
	if g == nil {
		return ""
	}
	return g.Name
}

func NewGuildEnv(g discord.Guild) *GuildEnv {
	icon := ""
	if g.Icon != "" {
		icon = g.IconURL()
	}
	return &GuildEnv{
		ID:          g.ID.String(),
		Name:        g.Name,
		Icon:        icon,
		MemberCount: int(g.ApproximateMembers),
	}
}

type RoleEnv struct {
	ID       string `expr:"id" json:"id"`
	Name     string `expr:"name" json:"name"`
	Color    int    `expr:"color" json:"color"`
	Position int    `expr:"position" json:"position"`
	Mention  string `expr:"mention" json:"mention"`
}

func (r *RoleEnv) String() string {
	if r == nil {
		return ""
	}
	return r.Mention
}

func NewRoleEnv(r discord.Role) *RoleEnv {
	return &RoleEnv{
		ID:       r.ID.String(),
		Name:     r.Name,
		Color:    int(r.Color),
		Position: r.Position,
		Mention:  r.Mention(),
	}
}

type ComponentEnv struct {
	CustomID string   `expr:"custom_id" json:"custom_id"`
	Value    string   `expr:"value" json:"value"`
	Values   []string `expr:"values" json:"values"`
}

type CommandEnv struct {
	ID   string         `expr:"id" json:"id"`
	Name string         `expr:"name" json:"name"`
	Args map[string]any `expr:"args" json:"args"`
}

type InteractionEnv struct {
	ID         string                   `expr:"id" json:"id"`
	Channel    *ChannelEnv              `expr:"channel" json:"channel"`
	Guild      *GuildEnv                `expr:"guild" json:"guild"`
	User       any                      `expr:"user" json:"user"`
	Member     any                      `expr:"member" json:"member"`
	Command    *CommandEnv              `expr:"command" json:"command"`
	Components map[string]*ComponentEnv `expr:"components" json:"components"`
	Values     []string                 `expr:"values" json:"values"`
	Value      string                   `expr:"value" json:"value"`
}

func (e *InteractionEnv) String() string {
	if e == nil {
		return ""
	}
	return e.ID
}

func NewInteractionEnv(i *discord.InteractionEvent, session *state.State) *InteractionEnv {
	e := &InteractionEnv{
		ID:         i.ID.String(),
		Components: make(map[string]*ComponentEnv),
	}

	if i.Channel != nil {
		e.Channel = NewChannelEnv(*i.Channel)
	} else if session != nil && i.ChannelID != 0 {
		if ch, err := session.Channel(i.ChannelID); err == nil && ch != nil {
			e.Channel = NewChannelEnv(*ch)
		}
	}

	if i.Member != nil {
		mEnv := NewMemberEnv(*i.Member)
		e.Member = mEnv
		e.User = mEnv.User
	} else if i.User != nil {
		uEnv := NewUserEnv(*i.User)
		e.User = uEnv
		e.Member = uEnv
	}

	if session != nil && i.GuildID != 0 {
		if g, err := session.Guild(i.GuildID); err == nil && g != nil {
			e.Guild = NewGuildEnv(*g)
		}
	}

	if i.Data != nil && i.Data.InteractionType() == discord.CommandInteractionType {
		if data, ok := i.Data.(*discord.CommandInteraction); ok {
			e.Command = &CommandEnv{
				ID:   data.ID.String(),
				Name: data.Name,
				Args: extractCommandArgs(data),
			}
		}
	}

	return e
}

func extractCommandArgs(data *discord.CommandInteraction) map[string]any {
	args := make(map[string]any)

	var addOption func(option discord.CommandInteractionOption)
	addOption = func(opt discord.CommandInteractionOption) {
		var value any
		if len(opt.Value) > 0 {
			_ = json.Unmarshal(opt.Value, &value)
		}

		switch opt.Type {
		case discord.UserOptionType:
			if str, ok := value.(string); ok {
				userID, _ := strconv.ParseInt(str, 10, 64)
				if u, ok := data.Resolved.Users[discord.UserID(userID)]; ok {
					if m, ok := data.Resolved.Members[discord.UserID(userID)]; ok {
						m.User = u
						args[opt.Name] = NewMemberEnv(m)
						return
					}
					args[opt.Name] = NewUserEnv(u)
					return
				}
			}
			args[opt.Name] = value
		case discord.RoleOptionType:
			if str, ok := value.(string); ok {
				roleID, _ := strconv.ParseInt(str, 10, 64)
				if r, ok := data.Resolved.Roles[discord.RoleID(roleID)]; ok {
					args[opt.Name] = NewRoleEnv(r)
					return
				}
			}
			args[opt.Name] = value
		case discord.ChannelOptionType:
			if str, ok := value.(string); ok {
				chID, _ := strconv.ParseInt(str, 10, 64)
				if ch, ok := data.Resolved.Channels[discord.ChannelID(chID)]; ok {
					args[opt.Name] = NewChannelEnv(ch)
					return
				}
			}
			args[opt.Name] = value
		case discord.SubcommandOptionType, discord.SubcommandGroupOptionType:
			for _, sub := range opt.Options {
				addOption(sub)
			}
		default:
			args[opt.Name] = value
		}
	}

	for _, opt := range data.Options {
		addOption(opt)
	}

	return args
}

// NewContextFromInteraction initializes an eval Context pre-populated with Discord interaction data.
func NewContextFromInteraction(i *discord.InteractionEvent, session *state.State) Context {
	interactionEnv := NewInteractionEnv(i, session)

	return Context{
		Env: Env{
			"interaction": interactionEnv,
			"channel":     interactionEnv.Channel,
			"guild":       interactionEnv.Guild,
			"server":      interactionEnv.Guild,
			"user":        interactionEnv.User,
			"member":      interactionEnv.Member,

			"arg": func(name string) any {
				if interactionEnv.Command == nil {
					return nil
				}
				return interactionEnv.Command.Args[name]
			},
			"input": func(customID string) any {
				if interactionEnv.Components == nil {
					return nil
				}
				if component, ok := interactionEnv.Components[customID]; ok {
					return component.Value
				}
				return nil
			},
			"inputs": func(customID string) any {
				if interactionEnv.Components == nil {
					return nil
				}
				if component, ok := interactionEnv.Components[customID]; ok {
					return component.Values
				}
				return nil
			},
		},
	}
}

type MessageEnv struct {
	ID        string `expr:"id" json:"id"`
	Content   string `expr:"content" json:"content"`
	ChannelID string `expr:"channel_id" json:"channel_id"`
	GuildID   string `expr:"guild_id" json:"guild_id"`
}

func (m *MessageEnv) String() string {
	if m == nil {
		return ""
	}
	return m.Content
}

func NewMessageEnv(msg discord.Message) *MessageEnv {
	return &MessageEnv{
		ID:        msg.ID.String(),
		Content:   msg.Content,
		ChannelID: msg.ChannelID.String(),
		GuildID:   msg.GuildID.String(),
	}
}

type EmojiEnv struct {
	ID       string `expr:"id" json:"id"`
	Name     string `expr:"name" json:"name"`
	Animated bool   `expr:"animated" json:"animated"`
}

func (e *EmojiEnv) String() string {
	if e == nil {
		return ""
	}
	if e.ID != "" && e.ID != "0" {
		if e.Animated {
			return "<a:" + e.Name + ":" + e.ID + ">"
		}
		return "<:" + e.Name + ":" + e.ID + ">"
	}
	return e.Name
}

func NewEmojiEnv(emoji discord.Emoji) *EmojiEnv {
	return &EmojiEnv{
		ID:       emoji.ID.String(),
		Name:     emoji.Name,
		Animated: emoji.Animated,
	}
}

type EventEnv struct {
	Type    string      `expr:"type" json:"type"`
	User    any         `expr:"user" json:"user"`
	Member  any         `expr:"member" json:"member"`
	Channel *ChannelEnv `expr:"channel" json:"channel"`
	Guild   *GuildEnv   `expr:"guild" json:"guild"`
	Message *MessageEnv `expr:"message" json:"message"`
	Emoji   *EmojiEnv   `expr:"emoji" json:"emoji"`
}

func NewEventEnv(event gateway.Event, session *state.State) *EventEnv {
	env := &EventEnv{}

	switch e := event.(type) {
	case *gateway.MessageCreateEvent:
		env.Type = "message_create"
		if e.Member != nil {
			mEnv := NewMemberEnv(*e.Member)
			env.Member = mEnv
			env.User = mEnv.User
		} else {
			uEnv := NewUserEnv(e.Author)
			env.User = uEnv
			env.Member = uEnv
		}
		if session != nil && e.ChannelID != 0 {
			if ch, err := session.Channel(e.ChannelID); err == nil && ch != nil {
				env.Channel = NewChannelEnv(*ch)
			}
		}
		if env.Channel == nil {
			env.Channel = &ChannelEnv{ID: e.ChannelID.String()}
		}
		if session != nil && e.GuildID != 0 {
			if g, err := session.Guild(e.GuildID); err == nil && g != nil {
				env.Guild = NewGuildEnv(*g)
			}
		}
		env.Message = NewMessageEnv(e.Message)

	case *gateway.MessageUpdateEvent:
		env.Type = "message_update"
		if e.Member != nil {
			mEnv := NewMemberEnv(*e.Member)
			env.Member = mEnv
			env.User = mEnv.User
		} else if e.Author.ID.IsValid() {
			uEnv := NewUserEnv(e.Author)
			env.User = uEnv
			env.Member = uEnv
		}
		if session != nil && e.ChannelID != 0 {
			if ch, err := session.Channel(e.ChannelID); err == nil && ch != nil {
				env.Channel = NewChannelEnv(*ch)
			}
		}
		if env.Channel == nil {
			env.Channel = &ChannelEnv{ID: e.ChannelID.String()}
		}
		if session != nil && e.GuildID != 0 {
			if g, err := session.Guild(e.GuildID); err == nil && g != nil {
				env.Guild = NewGuildEnv(*g)
			}
		}
		env.Message = NewMessageEnv(e.Message)

	case *gateway.MessageDeleteEvent:
		env.Type = "message_delete"
		env.Message = &MessageEnv{
			ID:        e.ID.String(),
			ChannelID: e.ChannelID.String(),
			GuildID:   e.GuildID.String(),
		}
		if session != nil && e.ChannelID != 0 {
			if ch, err := session.Channel(e.ChannelID); err == nil && ch != nil {
				env.Channel = NewChannelEnv(*ch)
			}
		}
		if env.Channel == nil {
			env.Channel = &ChannelEnv{ID: e.ChannelID.String()}
		}
		if session != nil && e.GuildID != 0 {
			if g, err := session.Guild(e.GuildID); err == nil && g != nil {
				env.Guild = NewGuildEnv(*g)
			}
		}

	case *gateway.GuildMemberAddEvent:
		env.Type = "guild_member_add"
		mEnv := NewMemberEnv(e.Member)
		env.Member = mEnv
		env.User = mEnv.User
		if session != nil && e.GuildID != 0 {
			if g, err := session.Guild(e.GuildID); err == nil && g != nil {
				env.Guild = NewGuildEnv(*g)
			}
		}

	case *gateway.GuildMemberRemoveEvent:
		env.Type = "guild_member_remove"
		uEnv := NewUserEnv(e.User)
		env.User = uEnv
		env.Member = uEnv
		if session != nil && e.GuildID != 0 {
			if g, err := session.Guild(e.GuildID); err == nil && g != nil {
				env.Guild = NewGuildEnv(*g)
			}
		}

	case *gateway.MessageReactionAddEvent:
		env.Type = "message_reaction_add"
		if e.Member != nil {
			mEnv := NewMemberEnv(*e.Member)
			env.Member = mEnv
			env.User = mEnv.User
		} else {
			env.User = &UserEnv{ID: e.UserID.String()}
			env.Member = env.User
		}
		if session != nil && e.ChannelID != 0 {
			if ch, err := session.Channel(e.ChannelID); err == nil && ch != nil {
				env.Channel = NewChannelEnv(*ch)
			}
		}
		if env.Channel == nil {
			env.Channel = &ChannelEnv{ID: e.ChannelID.String()}
		}
		if session != nil && e.GuildID != 0 {
			if g, err := session.Guild(e.GuildID); err == nil && g != nil {
				env.Guild = NewGuildEnv(*g)
			}
		}
		env.Message = &MessageEnv{
			ID:        e.MessageID.String(),
			ChannelID: e.ChannelID.String(),
			GuildID:   e.GuildID.String(),
		}
		env.Emoji = NewEmojiEnv(e.Emoji)

	case *gateway.MessageReactionRemoveEvent:
		env.Type = "message_reaction_remove"
		env.User = &UserEnv{ID: e.UserID.String()}
		env.Member = env.User
		if session != nil && e.ChannelID != 0 {
			if ch, err := session.Channel(e.ChannelID); err == nil && ch != nil {
				env.Channel = NewChannelEnv(*ch)
			}
		}
		if env.Channel == nil {
			env.Channel = &ChannelEnv{ID: e.ChannelID.String()}
		}
		if session != nil && e.GuildID != 0 {
			if g, err := session.Guild(e.GuildID); err == nil && g != nil {
				env.Guild = NewGuildEnv(*g)
			}
		}
		env.Message = &MessageEnv{
			ID:        e.MessageID.String(),
			ChannelID: e.ChannelID.String(),
			GuildID:   e.GuildID.String(),
		}
		env.Emoji = NewEmojiEnv(e.Emoji)
	}

	return env
}

func NewContextFromGatewayEvent(event gateway.Event, session *state.State) Context {
	eventEnv := NewEventEnv(event, session)
	return Context{
		Env: Env{
			"event":   eventEnv,
			"user":    eventEnv.User,
			"member":  eventEnv.Member,
			"channel": eventEnv.Channel,
			"guild":   eventEnv.Guild,
			"server":  eventEnv.Guild,
			"message": eventEnv.Message,
			"emoji":   eventEnv.Emoji,
		},
	}
}
