import React, { useMemo } from 'react';
import { BarChart3, Users, Award, TrendingUp, School } from 'lucide-react';

interface AnalyticsDashboardProps {
  allData: any[];
  badges: any[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  allData,
  badges
}) => {
  const stats = useMemo(() => {
    const pesertaOnly = allData.filter(d => d.role === 'PESERTA' || d.role === 'PENERIMA RAMBU');
    
    // Total participants
    const totalPeserta = pesertaOnly.length;

    // Badge distribution
    const badgeDistribution: Record<string, number> = {};
    pesertaOnly.forEach(item => {
      if (item.badge) {
        badgeDistribution[item.badge] = (badgeDistribution[item.badge] || 0) + 1;
      }
    });

    // School distribution
    const schoolDistribution: Record<string, number> = {};
    pesertaOnly.forEach(item => {
      if (item.school) {
        schoolDistribution[item.school] = (schoolDistribution[item.school] || 0) + 1;
      }
    });

    // Badge recipients
    const totalBadgeRecipients = pesertaOnly.filter(d => d.badge).length;
    const badgePercentage = totalPeserta > 0 ? Math.round((totalBadgeRecipients / totalPeserta) * 100) : 0;

    // Top schools
    const topSchools = Object.entries(schoolDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalPeserta,
      totalBadgeRecipients,
      badgePercentage,
      badgeDistribution,
      topSchools
    };
  }, [allData]);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Peserta */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Jumlah Peserta</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalPeserta}</p>
            </div>
            <Users className="w-10 h-10 text-blue-500 opacity-20" />
          </div>
        </div>

        {/* Badge Recipients */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Penerima Anugerah</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalBadgeRecipients}</p>
              <p className="text-sm text-gray-500 mt-1">{stats.badgePercentage}% daripada peserta</p>
            </div>
            <Award className="w-10 h-10 text-green-500 opacity-20" />
          </div>
        </div>

        {/* Badge Types */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Jenis Anugerah</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {Object.keys(stats.badgeDistribution).length}
              </p>
            </div>
            <BarChart3 className="w-10 h-10 text-purple-500 opacity-20" />
          </div>
        </div>

        {/* Top School */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Sekolah Teratas</p>
              <p className="text-lg font-bold text-gray-900 mt-2">
                {stats.topSchools[0]?.[0] || '-'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {stats.topSchools[0]?.[1] || 0} peserta
              </p>
            </div>
            <School className="w-10 h-10 text-orange-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* Badge Distribution & Top Schools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Badge Distribution */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-green-600" />
            Agihan Anugerah
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.badgeDistribution)
              .sort((a, b) => b[1] - a[1])
              .map(([badge, count]) => (
                <div key={badge}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{badge}</span>
                    <span className="text-gray-600">{count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{
                        width: `${
                          stats.totalBadgeRecipients > 0
                            ? (count / stats.totalBadgeRecipients) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Top Schools */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <School className="w-5 h-5 text-orange-600" />
            5 Sekolah Teratas
          </h3>
          <div className="space-y-3">
            {stats.topSchools.map(([school, count], idx) => (
              <div key={school} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600">
                    {idx + 1}
                  </div>
                  <span className="text-gray-700 text-sm">{school}</span>
                </div>
                <span className="font-bold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
