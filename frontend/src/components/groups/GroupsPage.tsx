/**
 * GroupsPage.tsx — Bill Splitting Group List
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Plus, FolderPlus, ArrowRight, Loader2 } from 'lucide-react';

interface Group {
  id: string;
  name: string;
  created_at: string;
}

export const GroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [membersInput, setMembersInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/groups');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (_) {
      setError('Could not retrieve group categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      alert('Please enter a group name.');
      return;
    }

    setActionLoading(true);
    // Parse comma-separated members
    const memberNames = membersInput
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          member_names: memberNames,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setGroups((prev) => [data.group, ...prev]);
        setGroupName('');
        setMembersInput('');
        setIsCreating(false);
      } else {
        alert(data.error || 'Failed to create group.');
      }
    } catch (_) {
      alert('Network error — please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex flex-col gap-6 w-full py-6"
    >
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <p className="eyebrow mb-1">Cooperative</p>
          <h1
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '36px',
              fontWeight: 400,
              color: 'var(--color-text)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Bill Splitting
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Cultivate shared expenses. Greedily simplifies debts to minimum settlements.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="btn-primary"
          style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
        >
          <Plus size={15} />
          Create Group
        </button>
      </div>

      {/* Creation Modal/Drawer */}
      <AnimatePresence>
        {isCreating && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(28,27,25,0.4)',
                backdropFilter: 'blur(4px)',
                zIndex: 40,
              }}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
              animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
              exit={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '420px',
                maxWidth: '92vw',
                background: '#FDFCF9',
                boxShadow: '0 20px 60px rgba(28,27,25,0.15)',
                borderRadius: '20px',
                padding: '24px',
                zIndex: 50,
              }}
            >
              <h3
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '22px',
                  fontWeight: 400,
                  margin: '0 0 16px 0',
                }}
              >
                New Split Group
              </h3>
              <form onSubmit={handleCreateGroup} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="gp-name" className="eyebrow">
                    Group Name
                  </label>
                  <input
                    id="gp-name"
                    type="text"
                    className="verdant-input"
                    placeholder="e.g. Goa Cultivation Trip"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    required
                    disabled={actionLoading}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="gp-mems" className="eyebrow">
                    Initial Members (Comma separated)
                  </label>
                  <input
                    id="gp-mems"
                    type="text"
                    className="verdant-input"
                    placeholder="Arjun Mehta, Priya Sharma, Rohit"
                    value={membersInput}
                    onChange={(e) => setMembersInput(e.target.value)}
                    disabled={actionLoading}
                  />
                  <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>
                    Include all split counterparts (separated by commas).
                  </span>
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    type="submit"
                    className="btn-primary flex-1"
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        Create
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="btn-secondary flex-1"
                    disabled={actionLoading}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Group List Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="glass-card h-32 animate-pulse bg-[--color-border]/30" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center" style={{ border: '1px solid rgba(181,83,60,0.15)', background: 'var(--color-terra-light)' }}>
          <p className="text-sm" style={{ color: 'var(--color-terra)' }}>{error}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-card p-10 text-center flex flex-col items-center justify-center border-dashed">
          <FolderPlus size={36} strokeWidth={1.2} className="text-[--color-text-faint] mb-3" />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>No groups created yet</p>
          <p className="text-xs max-w-sm mt-0" style={{ color: 'var(--color-text-muted)' }}>
            Start a split group and add members to dynamically track expenditures and greedy settlement routes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {groups.map((gp) => (
            <Link
              key={gp.id}
              to={`/groups/${gp.id}`}
              className="glass-card p-5 hover:translate-y-[-2px] hover:shadow-lg transition-all text-left flex flex-col justify-between min-h-[120px] text-decoration-none"
              style={{ display: 'flex', cursor: 'pointer', border: '1px solid var(--color-border)' }}
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[--color-text-faint]">
                  Split Envelope
                </span>
                <h3 className="text-base font-semibold m-0 mt-1" style={{ color: 'var(--color-text)' }}>
                  {gp.name}
                </h3>
              </div>
              <div className="flex items-center justify-between text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
                <span>Created: {new Date(gp.created_at).toLocaleDateString()}</span>
                <ArrowRight size={14} className="text-[--color-green]" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default GroupsPage;
