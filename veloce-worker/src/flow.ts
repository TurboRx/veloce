export interface FlowNode {
  id: string;
  type: string;
  data?: {
    name?: string;
    response_content?: string;
    response_ephemeral?: boolean;
    message_content?: string;
    message_channel_id?: string;
    condition_expression?: string;
    variable_name?: string;
    variable_value?: string;
    [key: string]: any;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface FlowSource {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface InteractionPayload {
  id?: string;
  token?: string;
  type: number;
  data?: {
    name?: string;
    options?: Array<{ name: string; value: any; type: number }>;
    custom_id?: string;
  };
  member?: {
    user?: {
      id: string;
      username: string;
      global_name?: string;
      discriminator?: string;
    };
    roles?: string[];
  };
  user?: {
    id: string;
    username: string;
    global_name?: string;
    discriminator?: string;
  };
  channel_id?: string;
  guild_id?: string;
}

export interface FlowExecutionOptions {
  addBranding?: boolean;
}

export interface FlowExecutionResult {
  response?: {
    type: number;
    data: {
      content: string;
      flags?: number;
    };
  };
  channelMessages?: Array<{
    channel_id: string;
    content: string;
  }>;
  logs: string[];
}

export const VELOCE_BRANDING_FOOTER = "\n\n-# ⚡ Powered by [Veloce](<https://veloce-app.pages.dev>)";

export function applyBranding(content: string, addBranding = true): string {
  if (!addBranding) return content;
  if (content.includes("Powered by [Veloce") || content.includes("Powered by Veloce")) {
    return content;
  }
  return `${content}${VELOCE_BRANDING_FOOTER}`;
}

export function evaluateTemplate(template: string, context: Record<string, any>): string {
  if (!template) return "";
  return template.replace(/\{\{?\s*([a-zA-Z0-9_.]+)\s*\}?\}/g, (match, path) => {
    const parts = path.split(".");
    let val: any = context;
    for (const part of parts) {
      if (val === undefined || val === null) break;
      val = val[part];
    }
    return val !== undefined && val !== null ? String(val) : match;
  });
}

export function executeFlow(
  flow: FlowSource,
  interaction: InteractionPayload,
  options: FlowExecutionOptions = { addBranding: true }
): FlowExecutionResult {
  const logs: string[] = [];
  const channelMessages: Array<{ channel_id: string; content: string }> = [];
  const nodes = flow.nodes || [];
  const edges = flow.edges || [];
  const shouldBrand = options.addBranding !== false;

  const user = interaction.member?.user || interaction.user || { id: "unknown", username: "User" };
  const optionsMap: Record<string, any> = {};
  if (interaction.data?.options) {
    for (const opt of interaction.data.options) {
      optionsMap[opt.name] = opt.value;
    }
  }

  const context: Record<string, any> = {
    user,
    options: optionsMap,
    guild_id: interaction.guild_id,
    channel_id: interaction.channel_id,
  };

  // Find entry node
  const commandName = interaction.data?.name?.toLowerCase();
  const entryNode =
    nodes.find(
      (n) =>
        (n.type === "entry_command" || n.type === "entry_event") &&
        (n.data?.name?.toLowerCase() === commandName || !commandName)
    ) || nodes.find((n) => n.type === "entry_command" || n.type === "entry_event");

  if (!entryNode) {
    logs.push("No matching entry node found");
    return {
      response: {
        type: 4,
        data: {
          content: applyBranding("Flow entry not found for this command.", shouldBrand),
          flags: 64,
        },
      },
      channelMessages,
      logs,
    };
  }

  logs.push(`Started execution at entry node ${entryNode.id}`);

  let currentNode: FlowNode | undefined = entryNode;
  let responseResult: { type: number; data: { content: string; flags?: number } } | undefined;
  const visited = new Set<string>();

  while (currentNode && visited.size < 50) {
    visited.add(currentNode.id);
    const nodeData = (currentNode.data as any)?.data || currentNode.data || {};

    if (currentNode.type === "action_response_create") {
      const rawContent = nodeData.response_content || "Done!";
      const evaluated = evaluateTemplate(rawContent, context);
      const content = applyBranding(evaluated, shouldBrand);
      const isEphemeral = !!nodeData.response_ephemeral;
      responseResult = {
        type: 4,
        data: {
          content,
          flags: isEphemeral ? 64 : undefined,
        },
      };
      logs.push(`action_response_create executed: "${evaluated}"`);
    } else if (currentNode.type === "action_message_create") {
      const rawContent = nodeData.message_content || "";
      const targetChannel = nodeData.message_channel_id || interaction.channel_id;
      if (rawContent && targetChannel) {
        const evaluated = evaluateTemplate(rawContent, context);
        const content = applyBranding(evaluated, shouldBrand);
        channelMessages.push({ channel_id: targetChannel, content });
        logs.push(`action_message_create queued for channel ${targetChannel}`);
      }
    } else if (currentNode.type === "action_variable_set") {
      const varName = nodeData.variable_name;
      const varVal = nodeData.variable_value;
      if (varName) {
        context[varName] = evaluateTemplate(varVal || "", context);
        logs.push(`Set variable ${varName} = ${context[varName]}`);
      }
    }

    const outgoingEdge = edges.find((e) => e.source === currentNode?.id);
    if (outgoingEdge) {
      currentNode = nodes.find((n) => n.id === outgoingEdge.target);
    } else {
      break;
    }
  }

  if (!responseResult) {
    responseResult = {
      type: 4,
      data: {
        content: applyBranding("Command executed successfully.", shouldBrand),
      },
    };
  }

  return {
    response: responseResult,
    channelMessages,
    logs,
  };
}
