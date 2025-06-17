import React, { useEffect, useState } from 'react';
import { useThoughtTracker } from '../hooks/useThoughtTracker';
import { Brain, Clock, FileText, Zap } from 'lucide-react';

interface ThoughtTrackingStatusProps {
  pageUuid?: string;
  className?: string;
}

export function ThoughtTrackingStatus({ 
  pageUuid, 
  className = '' 
}: ThoughtTrackingStatusProps) {
  const {
    brainState,
    organizedPages,
    recentEdits,
    unorganizedEdits,
    stats,
    isLoading,
    error,
    isOrganizing,
    triggerOrganization,
  } = useThoughtTracker('/api/summarize', '/api/organize');

  const [showDetails, setShowDetails] = useState(false);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-gray-500 text-sm ${className}`}>
        <Brain className="w-4 h-4 animate-pulse" />
        <span>Loading thought tracking...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 text-red-400 text-sm ${className}`}>
        <Brain className="w-4 h-4" />
        <span>Error: {error}</span>
      </div>
    );
  }

  const totalEdits = brainState?.edits.length || 0;
  const unorganizedCount = unorganizedEdits.length;
  const organizedCount = organizedPages.length;
  const recentCount = recentEdits.length;
  const maxEdits = brainState?.config.maxEditsBeforeOrganization || 20;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Status indicator */}
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 rounded p-2 transition-colors"
        onClick={() => setShowDetails(!showDetails)}
      >
        <Brain className={`w-4 h-4 ${isOrganizing ? 'animate-pulse text-blue-400' : 'text-gray-400'}`} />
        <span className="text-sm text-gray-300">
          {isOrganizing ? 'Organizing...' : `${unorganizedCount} unorganized edits`}
        </span>
        {unorganizedCount > maxEdits && (
          <Zap className="w-3 h-3 text-yellow-400" />
        )}
      </div>

      {/* Detailed stats */}
      {showDetails && (
        <div className="bg-gray-800/30 rounded-lg p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Total Edits</span>
            <span className="text-white">{totalEdits}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Unorganized Edits</span>
            <span className="text-white">{unorganizedCount}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Organized Pages</span>
            <span className="text-white">{organizedCount}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Recent Activity</span>
            <span className="text-white">{recentCount} edits</span>
          </div>

          {stats?.organization?.lastOrganization && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Last Organized</span>
              <span className="text-white">
                {new Date(stats.organization.lastOrganization).toLocaleDateString()}
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-gray-700">
            <button
              onClick={triggerOrganization}
              disabled={isOrganizing || unorganizedCount === 0}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-xs py-2 px-3 rounded transition-colors"
            >
              {isOrganizing ? (
                <>
                  <Brain className="w-3 h-3 animate-pulse" />
                  Organizing...
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3" />
                  {unorganizedCount === 0 ? 'No Edits to Organize' : 'Organize Now'}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Mini version for toolbar/status bar
export function ThoughtTrackingMini({ className = '' }: { className?: string }) {
  const { brainState, unorganizedEdits, isOrganizing, triggerOrganization } = useThoughtTracker();
  
  const unorganizedCount = unorganizedEdits.length;
  const maxEdits = brainState?.config.maxEditsBeforeOrganization || 20;
  const isReady = unorganizedCount > maxEdits;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        onClick={triggerOrganization}
        disabled={isOrganizing || unorganizedCount === 0}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
          isReady 
            ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30' 
            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
        }`}
        title={`${unorganizedCount} unorganized edits${isReady ? ' - ready for organization' : ''}`}
      >
        <Brain className={`w-3 h-3 ${isOrganizing ? 'animate-pulse' : ''}`} />
        <span>{unorganizedCount}</span>
        {isReady && <Zap className="w-2 h-2" />}
      </button>
    </div>
  );
} 