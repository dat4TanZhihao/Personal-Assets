import type { Repository } from '../repositories/types';
import type { DashboardOutput, DashboardScope, Range, User } from '../types';
import { startDateForRange } from '../utils/date';

export async function buildDashboard(repo: Repository, user: User, range: Range, today: string, scope: DashboardScope): Promise<DashboardOutput> {
  const start = startDateForRange(range, today);
  const snapshots = (await repo.list('daily_snapshots', { userId: user._id }))
    .filter((snapshot) => !start || snapshot.date >= start)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (snapshots.length === 0) {
    return {
      scope,
      profile: profileFor(user),
      members: [],
      summary: {
        totalValue: 0,
        investedPrincipal: 0,
        dailyInvestmentProfit: 0,
        dailyInvestmentReturn: 0,
        cumulativeInvestmentProfit: 0,
        cumulativeInvestmentReturn: 0,
        snapshotTime: null,
        dataCompleteness: 'COMPLETE',
        priceStatus: 'OK',
        fxStale: false,
        trustNotes: []
      },
      breakdown: { fund: 0, gold: 0, stock: 0, cash: 0 },
      series: []
    };
  }

  const latest = snapshots[snapshots.length - 1];
  return {
    scope,
    profile: profileFor(user),
    members: [],
    summary: {
      totalValue: latest.totalValue,
      investedPrincipal: latest.investedPrincipal,
      dailyInvestmentProfit: latest.dailyInvestmentProfit,
      dailyInvestmentReturn: latest.dailyInvestmentReturn,
      cumulativeInvestmentProfit: latest.cumulativeInvestmentProfit,
      cumulativeInvestmentReturn: latest.cumulativeInvestmentReturn,
      snapshotTime: latest.generatedAt,
      dataCompleteness: latest.dataCompleteness,
      priceStatus: latest.priceStatus,
      fxStale: latest.fxStale,
      trustNotes: latest.trustNotes
    },
    breakdown: latest.breakdown,
    series: snapshots.map((snapshot) => ({
      date: snapshot.date,
      totalValue: snapshot.totalValue,
      investedPrincipal: snapshot.investedPrincipal,
      dailyInvestmentProfit: snapshot.dailyInvestmentProfit,
      dailyInvestmentReturn: snapshot.dailyInvestmentReturn,
      cumulativeInvestmentProfit: snapshot.cumulativeInvestmentProfit,
      cumulativeInvestmentReturn: snapshot.cumulativeInvestmentReturn,
      breakdown: snapshot.breakdown,
      priceStatus: snapshot.priceStatus,
      fxStale: snapshot.fxStale,
      dataCompleteness: snapshot.dataCompleteness,
      trustNotes: snapshot.trustNotes
    }))
  };
}

function profileFor(user: User): DashboardOutput['profile'] {
  return {
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    profileCompleted: user.profileCompleted,
    onboardingCompleted: user.onboardingCompleted,
    gainLossColorMode: user.gainLossColorMode
  };
}
