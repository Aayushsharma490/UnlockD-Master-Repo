/**
 * AnalyticsPage.tsx — Financial Analytics dashboard including Recharts spending charts,
 * subscription detection list, and drag-and-drop CSV/PDF bank statement import flow.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Upload, Calendar, ArrowRight, TrendingUp, AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';

interface CategoryStat {
  category: string;
  total: number;
}

interface DailyStat {
  date: string;
  total: number;
}

interface RecurringItem {
  merchant: string;
  amount: number;
  frequency: string;
  nextExpectedDate: string;
}

const COLORS = [
  '#2F4F3E', // deep forest green
  '#B5533C', // muted terracotta
  '#C6A47E', // gold/sand accent
  '#5C8271', // light forest green
  '#DDA15E', // amber clay
  '#6B705C', // olive sage
  '#9B2226', // wine red
];

export const AnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM

  // Analytics states
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // File Upload states
  const [dragOver, setDragOver] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<{ imported: number; categorized: number; uncategorized: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch summary data
  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/analytics/summary?month=${selectedMonth}`);
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();

      setCategoryStats(data.categoryStats || []);
      setDailyStats(data.dailyStats || []);
      setRecurring(data.recurring || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve analytics data.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Total monthly spending
  const totalSpend = useMemo(() => {
    return categoryStats.reduce((acc, curr) => acc + curr.total, 0);
  }, [categoryStats]);

  // Format Recharts dates to local format
  const chartData = useMemo(() => {
    return dailyStats.map((item) => {
      const d = new Date(item.date);
      return {
        ...item,
        formattedDate: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        amountINR: item.total / 100,
      };
    });
  }, [dailyStats]);

  // Format Recharts pie categories
  const pieData = useMemo(() => {
    return categoryStats.map((item) => ({
      name: item.category,
      value: item.total / 100,
    }));
  }, [categoryStats]);

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragOver(true);
    } else if (e.type === 'dragleave') {
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const name = file.name.toLowerCase();
      if (name.endsWith('.csv') || name.endsWith('.pdf')) {
        setUploadFile(file);
        setUploadError(null);
        setUploadSummary(null);
      } else {
        setUploadError('Invalid format. Please drop a .csv or .pdf file.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadFile(file);
      setUploadError(null);
      setUploadSummary(null);
    }
  };

  // Perform upload
  const handleUpload = async () => {
    if (!uploadFile) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadSummary(null);

      const formData = new FormData();
      formData.append('file', uploadFile);

      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process statement.');

      setUploadSummary(data);
      setUploadFile(null);
      
      // Refresh local analytics numbers
      fetchAnalytics();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReviewTransactions = () => {
    // Navigate to transactions page filtered to imported sources
    navigate('/transactions?search=CSV/PDF Import');
  };

  const formatTimestampShort = (iso: string) => {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(iso));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex flex-col gap-6 w-full py-6"
    >
      {/* Title & Month Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <p className="eyebrow mb-1">Forensics</p>
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
            Analytics & Insights
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Observe spend categories, recurring subscriptions, and upload bank statements.
          </p>
        </div>

        {/* Month Selector */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[--color-text-muted] block mb-1">
            Selected Month
          </label>
          <input
            type="month"
            className="verdant-input"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ maxWidth: '180px' }}
          />
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 flex items-center gap-3 text-[--color-terra]" style={{ borderColor: 'rgba(181,83,60,0.3)', background: 'rgba(181,83,60,0.05)' }}>
          <AlertCircle size={18} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Row 1: Statement Import & Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metric 1: Total Spent */}
        <div className="glass-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-[--color-text-muted] m-0">Monthly Outflow</p>
            <h2
              className="font-display font-medium mt-1 mb-0"
              style={{ fontSize: '32px', color: 'var(--color-text)' }}
            >
              {formatCurrency(totalSpend)}
            </h2>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[--color-green]">
            <TrendingUp size={14} />
            <span>Compiled across {categoryStats.length} active categories</span>
          </div>
        </div>

        {/* Metric 2: Import statement file uploader */}
        <div className="md:col-span-2 glass-card p-5 flex flex-col md:flex-row gap-5 items-center justify-between">
          <div className="flex-1 w-full">
            <p className="text-xs uppercase tracking-wider text-[--color-text-muted] m-0 mb-2">Import Statement</p>
            
            {/* File Dropzone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all ${
                dragOver ? 'border-[--color-green] bg-white/20' : 'border-[--color-border] hover:bg-white/10'
              }`}
              style={{ minHeight: '100px' }}
            >
              <input
                type="file"
                id="file-upload-input"
                className="hidden"
                accept=".csv,.pdf"
                onChange={handleFileChange}
              />
              <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center">
                <Upload size={22} className="text-[--color-green] mb-1.5" />
                <span className="text-xs text-[--color-text] font-medium text-center">
                  {uploadFile ? uploadFile.name : 'Drop CSV or PDF statement, or browse'}
                </span>
                <span className="text-[10px] text-[--color-text-faint] text-center mt-0.5">
                  Best-effort auto-categorization matching merchant keywords
                </span>
              </label>
            </div>
          </div>

          {/* Action trigger & Summary states */}
          <div className="w-full md:w-56 flex flex-col justify-center border-t md:border-t-0 md:border-l border-[--color-border] pt-4 md:pt-0 md:pl-5">
            {uploadError && (
              <div className="flex items-start gap-1.5 text-[--color-terra] text-xs mb-3">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            {uploadSummary && (
              <div className="flex flex-col gap-1 text-xs mb-3 bg-white/30 p-2.5 rounded-lg border border-[--color-border]">
                <div className="flex items-center gap-1.5 text-[--color-green] font-medium mb-1">
                  <CheckCircle size={13} />
                  <span>Statement Imported!</span>
                </div>
                <div className="text-[10px] text-[--color-text-muted] flex justify-between">
                  <span>Imported rows:</span>
                  <span className="font-semibold text-[--color-text]">{uploadSummary.imported}</span>
                </div>
                <div className="text-[10px] text-[--color-text-muted] flex justify-between">
                  <span>Categorized:</span>
                  <span className="font-semibold text-[--color-green]">{uploadSummary.categorized}</span>
                </div>
                <button
                  onClick={handleReviewTransactions}
                  className="btn-accent flex items-center justify-center gap-1 text-[10px] py-1 px-2 mt-2 w-full"
                >
                  Review Imported
                  <ArrowRight size={10} />
                </button>
              </div>
            )}

            {uploadFile ? (
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="btn-accent w-full py-2.5 flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Confirm Import
                  </>
                )}
              </button>
            ) : (
              <label
                htmlFor="file-upload-input"
                className="btn-secondary w-full py-2.5 text-center block cursor-pointer text-xs"
              >
                Select File
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Charts (Spend over time & category breakdown) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Spending Over Time (Daily Area Chart) */}
        <div className="md:col-span-3 glass-card p-5">
          <p className="text-xs uppercase tracking-wider text-[--color-text-muted] mb-4">Spend Volume Distribution</p>
          <div style={{ width: '100%', height: 260 }}>
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <RefreshCw className="animate-spin text-[--color-green]" size={28} />
              </div>
            ) : chartData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-[--color-text-muted]">
                No transactions recorded for this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-green)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--color-green)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2DEC9" />
                  <XAxis dataKey="formattedDate" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(value: any) => [`₹${parseFloat(value).toLocaleString('en-IN')}`, 'Spent']}
                    labelFormatter={(label) => `Date: ${label}`}
                    contentStyle={{
                      background: 'rgba(250,247,242,0.95)',
                      borderColor: 'var(--color-border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amountINR"
                    stroke="var(--color-green)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorSpend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Category Breakdown (Donut Chart) */}
        <div className="md:col-span-2 glass-card p-5 flex flex-col justify-between">
          <p className="text-xs uppercase tracking-wider text-[--color-text-muted] mb-2">Category Allocations</p>
          <div className="flex-1 flex items-center justify-center" style={{ minHeight: 200 }}>
            {isLoading ? (
              <RefreshCw className="animate-spin text-[--color-green]" size={28} />
            ) : pieData.length === 0 ? (
              <span className="text-xs text-[--color-text-muted]">No records</span>
            ) : (
              <div style={{ width: '100%', height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="48%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => `₹${parseFloat(value).toLocaleString('en-IN')}`}
                      contentStyle={{
                        background: 'rgba(250,247,242,0.95)',
                        borderColor: 'var(--color-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          {/* Legend Details */}
          {!isLoading && pieData.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-2 border-t border-[--color-border] pt-3">
              {pieData.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--color-text)' }}>
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: COLORS[idx % COLORS.length] }}
                  />
                  <span>
                    {item.name}: ₹{Math.round(item.value).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Subscriptions & Recurring Cultivations */}
      <div className="glass-card p-5">
        <p className="text-xs uppercase tracking-wider text-[--color-text-muted] mb-4">Detected Subscription Payments</p>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <RefreshCw className="animate-spin text-[--color-green]" size={28} />
          </div>
        ) : recurring.length === 0 ? (
          <div className="p-8 text-center text-xs text-[--color-text-muted]">
            No recurring subscription intervals detected.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {recurring.map((item, idx) => (
              <div
                key={`${item.merchant}-${idx}`}
                className="flex items-center justify-between p-4 rounded-xl border border-[--color-border] bg-white/20 hover:bg-white/40 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[--color-green]"
                    style={{ background: 'var(--color-green-light)', border: '1px solid rgba(47,79,62,0.1)' }}
                  >
                    <Calendar size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold m-0" style={{ color: 'var(--color-text)' }}>
                      {item.merchant}
                    </h3>
                    <p className="text-[10px] m-0 mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      Interval: <span className="font-semibold">{item.frequency}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-sm font-semibold block text-[--color-text] font-display">
                    {formatCurrency(item.amount)}
                  </span>
                  <span className="text-[10px] text-[--color-text-faint] block mt-0.5">
                    Next: {formatTimestampShort(item.nextExpectedDate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AnalyticsPage;
