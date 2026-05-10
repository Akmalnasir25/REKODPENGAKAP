import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { SubmissionData } from '../../types';
import { TrendingUp, Users, Award, School, PieChart as PieIcon } from 'lucide-react';

interface AdvancedAnalyticsProps {
  data: SubmissionData[];
  year?: number;
}

const COLORS = ['#1e3a8a', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

export const AdvancedAnalytics: React.FC<AdvancedAnalyticsProps> = ({ data, year = new Date().getFullYear() }) => {
  const yearData = useMemo(() => data.filter(d => new Date(d.date).getFullYear() === year), [data, year]);

  // Badge distribution
  const badgeData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const badge = d.badge || 'Lain-lain';
      counts[badge] = (counts[badge] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [yearData]);

  // Gender distribution
  const genderData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const gender = d.gender || 'Tidak Dinyatakan';
      counts[gender] = (counts[gender] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [yearData]);

  // Category distribution
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      if (d.category) {
        counts[d.category] = (counts[d.category] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [yearData]);

  // Top 10 schools
  const topSchools = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const school = d.school || 'Tidak Dinyatakan';
      counts[school] = (counts[school] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 25) + '...' : name, value, fullName: name }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [yearData]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const months: Record<number, number> = {};
    yearData.forEach(d => {
      const month = new Date(d.date).getMonth();
      months[month] = (months[month] || 0) + 1;
    });
    const monthNames = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
    return monthNames.map((name, i) => ({ name, value: months[i] || 0 }));
  }, [yearData]);

  // Role distribution
  const roleData = useMemo(() => {
    const counts: Record<string, number> = {};
    yearData.forEach(d => {
      const role = (d.role || 'PESERTA').toUpperCase();
      counts[role] = (counts[role] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [yearData]);

  // Stats cards
  const stats = useMemo(() => {
    const uniqueSchools = new Set(yearData.map(d => d.schoolCode)).size;
    const uniqueBadges = new Set(yearData.map(d => d.badge)).size;
    const participants = yearData.filter(d => (d.role || 'PESERTA').toUpperCase() === 'PESERTA').length;
    return { total: yearData.length, schools: uniqueSchools, badges: uniqueBadges, participants };
  }, [yearData]);

  if (yearData.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <PieIcon size={48} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Tiada data untuk tahun {year}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 mb-1"><Users size={16} /><span className="text-[10px] font-bold uppercase text-gray-500">Jumlah Rekod</span></div>
          <p className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-green-600 mb-1"><Users size={16} /><span className="text-[10px] font-bold uppercase text-gray-500">Peserta</span></div>
          <p className="text-2xl font-bold text-gray-900">{stats.participants.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600 mb-1"><School size={16} /><span className="text-[10px] font-bold uppercase text-gray-500">Sekolah</span></div>
          <p className="text-2xl font-bold text-gray-900">{stats.schools}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-purple-600 mb-1"><Award size={16} /><span className="text-[10px] font-bold uppercase text-gray-500">Lencana</span></div>
          <p className="text-2xl font-bold text-gray-900">{stats.badges}</p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <h4 className="font-bold text-sm text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" /> Trend Bulanan {year}
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="#1e3a8a" strokeWidth={2} dot={{ fill: '#1e3a8a', r: 4 }} name="Pendaftaran" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Badge Distribution Pie */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <h4 className="font-bold text-sm text-gray-800 mb-4 flex items-center gap-2">
            <Award size={16} className="text-amber-600" /> Pecahan Lencana
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={badgeData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} fontSize={9}>
                {badgeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Schools Bar */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <h4 className="font-bold text-sm text-gray-800 mb-4 flex items-center gap-2">
            <School size={16} className="text-green-600" /> 10 Sekolah Teratas
          </h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topSchools} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(value: any, name: any, props: any) => [value, props.payload.fullName]} />
              <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} name="Bilangan" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gender + Role */}
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <h4 className="font-bold text-sm text-gray-800 mb-4 flex items-center gap-2">
            <Users size={16} className="text-purple-600" /> Pecahan Jantina & Peranan
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase text-center mb-2">Jantina</p>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={genderData} cx="50%" cy="50%" outerRadius={50} dataKey="value" fontSize={9}>
                    <Cell fill="#3b82f6" />
                    <Cell fill="#ec4899" />
                    <Cell fill="#9ca3af" />
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase text-center mb-2">Peranan</p>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={roleData} cx="50%" cy="50%" outerRadius={50} dataKey="value" fontSize={9}>
                    {roleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Category Chart (if data exists) */}
      {categoryData.length > 0 && (
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <h4 className="font-bold text-sm text-gray-800 mb-4 flex items-center gap-2">
            <PieIcon size={16} className="text-indigo-600" /> Pecahan Kategori Peserta
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Bilangan">
                {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
