export interface FlowNode {
  id: string;
  type: string;
  data?: {
    name?: string;
    response_content?: string;
    response_ephemeral?: boolean;
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
      discriminator: string;
    };
    roles?: string[];
  };
  user?: {
    id: string;
    username: string;
    discriminator: string;
  };
  channel_id?: string;
  guild_id?: string;
}

export interface FlowExecutionResult {
  response?: {
    type: number;
    data: {
      content: string;
      flags?: number;
    };
  };
  logs: string[];
}

export function evaluateTemplate(template: string, context: Record<string, any>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path) => {
    const parts = path.split(".");
    let val: any = context;
    for (const part of parts) {
      if (val === undefined || val === null) break;
      val = val[part];
    }
    return val !== undefined && val !== null ? String(val) : "";
  });
}

export function executeFlow(flow: FlowSource, interaction: InteractionPayload): FlowExecutionResult {
  const logs: string[] = [];
  const nodes = flow.nodes || [];
  const edges = flow.edges || [];

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
  const entryNode = nodes.find(
    (n) => n.type === "entry_command" && (n.data?.name?.toLowerCase() === commandName || !commandName)
  ) || nodes.find((n) => n.type === "entry_command");

  if (!entryNode) {
    logs.push("No matching entry_command node found");
    return {
      response: {
        type: 4,
        data: {
          content: "Flow entry not found for this command.",
          flags: 64, // Ephemeral
        },
      },
      logs,
    };
  }

  logs.push(`Started execution at entry node ${entryNode.id}`);

  // Traverse graph
  let currentNode: FlowNode | undefined = entryNode;
  let responseResult: { type: number; data: { content: string; flags?: number } } | undefined;
  const visited = new Set<string>();

  while (currentNode && visited.size < 50) {
    visited.add(currentNode.id);

    if (currentNode.type === "action_response_create") {
      const rawContent = currentNode.data?.response_content || "Done!";
      const content = evaluateTemplate(rawContent, context);
      const isEphemeral = !!currentNode.data?.response_ephemeral;
      responseResult = {
        type: 4, // InteractionResponseType: ChannelMessageWithSource
        data: {
          content,
          flags: isEphemeral ? 64 : undefined,
        },
      };
      logs.push(`action_response_create executed: "${content}"`);
    } else if (currentNode.type === "action_variable_set") {
      const varName = currentNode.data?.variable_name;
      const varVal = currentNode.data?.variable_value;
      if (varName) {
        context[varName] = evaluateTemplate(varVal || "", context);
        logs.push(`Set variable ${varName} = ${context[varName]}`);
      }
    }

    // Find next edge
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
        content: "Command executed successfully.",
      },
    };
  }

  return {
    response: responseResult,
    logs,
  };
}
