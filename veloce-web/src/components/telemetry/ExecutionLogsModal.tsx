import React from "react";
import { useQuery } from "@tanstack/react-query";
import { X, RefreshCw, Activity, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { api, Log } from "@/lib/api";

interface ExecutionLogsModalProps {
  appId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ExecutionLogsModal({ appId, isOpen, onClose }: ExecutionLogsModalProps) {
  const {
    data: logs,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<Log[]>({
    queryKey: ["app-logs", appId],
    queryFn: () => (appId ? api.listLogs(appId, 50, 0) : Promise.resolve([])),
    enabled: isOpen && !!appId,
    refetchInterval: isOpen ? 5000 : false,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-[calc(100vw-1.5rem)] sm:w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Live Execution & Audit Logs</h3>
              <p className="text-[11px] text-slate-400">
                Real-time traces of slash command dispatches and flow executions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="Refresh logs"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-indigo-400" : ""}`} />
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
        <div className="p-6 overflow-y-auto flex-1 font-mono text-xs space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">Loading execution traces...</div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No executions recorded yet. Invoke a command from Discord to see live logs!
            </div>
          ) : (
            logs.map((log) => {
              const isError = log.level === "error";
              const isWarn = log.level === "warn";
              const duration = log.details?.duration_ms;

              return (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border transition ${
                    isError
                      ? "bg-rose-950/20 border-rose-500/30 text-rose-200"
                      : isWarn
                      ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
                      : "bg-slate-950/60 border-slate-800/80 text-slate-200 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px]">
                    <div className="flex items-center gap-2">
                      {isError ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : isWarn ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="font-semibold uppercase tracking-wider text-[10px]">
                        {log.level}
                      </span>
                      <span className="text-slate-500">&bull;</span>
                      <span className="text-slate-400">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    {duration !== undefined && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        <Clock className="w-3 h-3" />
                        {duration}ms
                      </span>
                    )}
                  </div>

                  <div className="text-xs font-medium text-slate-100">{log.message}</div>

                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {log.details.user_id && (
                        <div>
                          User: <span className="text-slate-300">{log.details.user_id}</span>
                        </div>
                      )}
                      {log.details.guild_id && (
                        <div>
                          Guild: <span className="text-slate-300">{log.details.guild_id}</span>
                        </div>
                      )}
                      {log.details.error && (
                        <div className="col-span-full text-rose-400">
                          Error: <span>{log.details.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
