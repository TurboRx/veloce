import React from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Server, Users, RefreshCw, Radio } from "lucide-react";
import { api, Guild, GatewayStatus } from "@/lib/api";

interface GuildsModalProps {
  appId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function GuildsModal({ appId, isOpen, onClose }: GuildsModalProps) {
  const {
    data: guilds,
    isLoading: guildsLoading,
    refetch: refetchGuilds,
    isFetching: guildsFetching,
  } = useQuery<Guild[]>({
    queryKey: ["app-guilds", appId],
    queryFn: () => (appId ? api.listGuilds(appId) : Promise.resolve([])),
    enabled: isOpen && !!appId,
  });

  const { data: status } = useQuery<GatewayStatus>({
    queryKey: ["app-gateway-status", appId],
    queryFn: () => (appId ? api.getGatewayStatus(appId) : Promise.resolve({ connected: false, guild_count: 0 })),
    enabled: isOpen && !!appId,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-[calc(100vw-1.5rem)] sm:w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">Connected Discord Guilds</h3>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    status?.connected
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      status?.connected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                    }`}
                  />
                  {status?.connected ? "Gateway Online" : "Gateway Offline"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Servers where this Discord application is installed and active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchGuilds()}
              disabled={guildsFetching}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="Refresh servers"
            >
              <RefreshCw className={`w-4 h-4 ${guildsFetching ? "animate-spin text-emerald-400" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {guildsLoading ? (
            <div className="text-center py-12 text-slate-500 text-xs">Loading connected servers...</div>
          ) : !guilds || guilds.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No servers connected yet. Invite your bot to a server using the Discord OAuth2 URL.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {guilds.map((guild) => (
                <div
                  key={guild.id}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    {guild.icon ? (
                      <img
                        src={guild.icon}
                        alt={guild.name}
                        className="w-9 h-9 rounded-full border border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {guild.name.charAt(0)}
                      </div>
                    )}
                    <div className="overflow-hidden">
                      <h4 className="text-xs font-semibold text-slate-200 truncate">{guild.name}</h4>
                      <span className="text-[10px] font-mono text-slate-500 block truncate">
                        ID: {guild.id}
                      </span>
                    </div>
                  </div>

                  {guild.approximate_member_count !== undefined && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800/80 shrink-0">
                      <Users className="w-3 h-3 text-slate-500" />
                      <span>{guild.approximate_member_count}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
