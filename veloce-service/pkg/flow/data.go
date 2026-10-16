package flow

import (
	"regexp"
)

var commandNameRe = regexp.MustCompile(`^[-_a-z0-9]{1,32}$`)

type FlowNodeType string

const (
	// Entry points
	FlowNodeTypeEntryCommand         FlowNodeType = "entry_command"
	FlowNodeTypeEntryEvent           FlowNodeType = "entry_event"
	FlowNodeTypeEntryComponentButton FlowNodeType = "entry_component_button"

	// Command configuration options
	FlowNodeTypeOptionCommandArgument    FlowNodeType = "option_command_argument"
	FlowNodeTypeOptionCommandPermissions FlowNodeType = "option_command_permissions"
	FlowNodeTypeOptionCommandCooldown    FlowNodeType = "option_command_cooldown"

	// Actions - Discord Interaction Responses
	FlowNodeTypeActionResponseCreate FlowNodeType = "action_response_create"
	FlowNodeTypeActionResponseEdit   FlowNodeType = "action_response_edit"
	FlowNodeTypeActionResponseDelete FlowNodeType = "action_response_delete"
	FlowNodeTypeActionResponseDefer  FlowNodeType = "action_response_defer"

	// Actions - Channel Messages
	FlowNodeTypeActionMessageCreate FlowNodeType = "action_message_create"
	FlowNodeTypeActionMessageDelete FlowNodeType = "action_message_delete"

	// Logic & Control
	FlowNodeTypeControlBranch FlowNodeType = "control_branch"
	FlowNodeTypeControlDelay  FlowNodeType = "control_delay"

	// Variables
	FlowNodeTypeActionVariableSet FlowNodeType = "action_variable_set"

	// Roles & Members
	FlowNodeTypeActionMemberRoleAdd    FlowNodeType = "action_member_role_add"
	FlowNodeTypeActionMemberRoleRemove FlowNodeType = "action_member_role_remove"
)

type CommandArgumentType string

const (
	CommandArgumentTypeString      CommandArgumentType = "string"
	CommandArgumentTypeInteger     CommandArgumentType = "integer"
	CommandArgumentTypeBoolean     CommandArgumentType = "boolean"
	CommandArgumentTypeUser        CommandArgumentType = "user"
	CommandArgumentTypeChannel     CommandArgumentType = "channel"
	CommandArgumentTypeRole        CommandArgumentType = "role"
	CommandArgumentTypeMentionable CommandArgumentType = "mentionable"
	CommandArgumentTypeNumber      CommandArgumentType = "number"
)

type FlowData struct {
	Nodes []FlowNode `json:"nodes"`
	Edges []FlowEdge `json:"edges"`
}

type FlowNode struct {
	ID       string       `json:"id"`
	Type     FlowNodeType `json:"type"`
	Data     FlowNodeData `json:"data"`
	Position Position     `json:"position,omitempty"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type FlowEdge struct {
	ID           string `json:"id"`
	Source       string `json:"source"`
	Target       string `json:"target"`
	SourceHandle string `json:"sourceHandle,omitempty"`
	TargetHandle string `json:"targetHandle,omitempty"`
}

type CommandArgumentChoice struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type FlowNodeData struct {
	// General
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	EventType   string `json:"event_type,omitempty"`

	// Command Options
	CommandArgumentType     CommandArgumentType     `json:"command_argument_type,omitempty"`
	CommandArgumentRequired bool                    `json:"command_argument_required,omitempty"`
	CommandArgumentChoices  []CommandArgumentChoice `json:"command_argument_choices,omitempty"`

	// Permissions / Cooldown
	Permissions     int64 `json:"permissions,omitempty"`
	CooldownSeconds int   `json:"cooldown_seconds,omitempty"`

	// Response Actions
	ResponseContent   string `json:"response_content,omitempty"`
	ResponseEphemeral bool   `json:"response_ephemeral,omitempty"`

	// Message Actions
	MessageContent   string `json:"message_content,omitempty"`
	MessageChannelID string `json:"message_channel_id,omitempty"`

	// Logic / Branching
	ConditionExpression string `json:"condition_expression,omitempty"`

	// Delay
	DelaySeconds int `json:"delay_seconds,omitempty"`

	// Variable
	VariableName  string `json:"variable_name,omitempty"`
	VariableValue string `json:"variable_value,omitempty"`

	// Member Roles
	RoleID string `json:"role_id,omitempty"`
	UserID string `json:"user_id,omitempty"`
}
