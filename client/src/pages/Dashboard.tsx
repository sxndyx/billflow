import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { GettingStarted } from "@/components/GettingStarted";
import { useResetAnalytics } from "@/hooks/use-invoices";
import { StatCard } from "@/components/StatCard";
import { DollarSign, ArrowUpRight, RefreshCw, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, startOfWeek, addDays, subDays, startOfYear, endOfYear, differenceInDays } from "date-fns";
import { api } from "@shared/routes";

const PRESETS = [
  { value: "7d", label: "7D", days: 7 },
  { value: "14d", label: "14D", days: 14 },
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
];

const YEARS = [2024, 2025, 2026, 2027];

export default function Dashboard() {
  const { user } = useAuth();
  const resetAnalytics = useResetAnalytics();
  
  const now = new Date();
  const defaultStart = startOfWeek(now, { weekStartsOn: 0 });
  const defaultEnd = addDays(defaultStart, 6);
  
  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [endDate, setEndDate] = useState<Date>(defaultEnd);
  const [activePreset, setActivePreset] = useState<string>("7d");

  const periodDays = useMemo(() => differenceInDays(endDate, startDate) + 1, [startDate, endDate]);
  const bucket = periodDays > 120 ? "weekly" : "daily";

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: [api.analytics.earnings.path, format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"), bucket],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: format(startDate, "yyyy-MM-dd"),
        end: format(endDate, "yyyy-MM-dd"),
        bucket
      });
      const res = await fetch(`${api.analytics.earnings.path}?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return api.analytics.earnings.responses[200].parse(await res.json());
    },
  });

  const handlePreset = (preset: string) => {
    setActivePreset(preset);
    const days = PRESETS.find(p => p.value === preset)?.days || 7;
    
    if (preset === "7d") {
      const weekStart = startOfWeek(now, { weekStartsOn: 0 });
      setStartDate(weekStart);
      setEndDate(addDays(weekStart, 6));
    } else {
      setEndDate(now);
      setStartDate(subDays(now, days - 1));
    }
  };

  const handleYearSelect = (year: string) => {
    const yearNum = parseInt(year);
    setActivePreset("");
    setStartDate(startOfYear(new Date(yearNum, 0, 1)));
    setEndDate(endOfYear(new Date(yearNum, 0, 1)));
  };

  const handleDateRangeChange = (start: Date, end: Date) => {
    setActivePreset("");
    setStartDate(start);
    setEndDate(end);
  };

  const navigateRange = (direction: "prev" | "next") => {
    const offset = direction === "prev" ? -periodDays : periodDays;
    setActivePreset("");
    setStartDate(addDays(startDate, offset));
    setEndDate(addDays(endDate, offset));
  };

  const handleReset = () => {
    resetAnalytics.mutate();
    refetch();
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-12 w-64 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const chartData = stats?.series.map(d => ({
    name: periodDays > 120 
      ? format(parseISO(d.date), "MMM d")
      : format(parseISO(d.date), "MMM d"),
    value: d.amount,
  })) || [];

  const trend = stats && stats.total > stats.previousTotal ? "up" : "down";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 md:pb-8">
      <GettingStarted />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground" data-testid="text-welcome">
            Welcome back, {user?.firstName || 'User'}
          </h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your billing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-secondary/50 rounded-full p-1">
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                variant={activePreset === p.value ? "default" : "ghost"}
                size="sm"
                className="rounded-full px-3"
                onClick={() => handlePreset(p.value)}
                data-testid={`button-period-${p.value}`}
              >
                {p.label}
              </Button>
            ))}
          </div>
          
          <Select onValueChange={handleYearSelect}>
            <SelectTrigger className="w-24 rounded-xl" data-testid="select-year">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              onClick={() => navigateRange("prev")}
              data-testid="button-nav-prev"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="min-w-[180px] justify-start text-left font-normal rounded-xl" data-testid="button-date-range">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-fit">
                <DialogHeader>
                  <DialogTitle>Select Date Range</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Start Date</p>
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => date && handleDateRangeChange(date, endDate < date ? date : endDate)}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">End Date</p>
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => date && handleDateRangeChange(startDate > date ? date : startDate, date)}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              onClick={() => navigateRange("next")}
              data-testid="button-nav-next"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleReset}
            disabled={resetAnalytics.isPending}
            data-testid="button-reset-analytics"
          >
            <RefreshCw className={`w-4 h-4 ${resetAnalytics.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard 
          title="Period Earnings" 
          value={formatCurrency(stats?.total || 0)} 
          description={`${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`}
          icon={<DollarSign className="w-6 h-6" />}
          trend={trend}
          data-testid="stat-earnings"
        />
        <StatCard 
          title="Previous Period" 
          value={formatCurrency(stats?.previousTotal || 0)}
          description={stats ? `${format(parseISO(stats.prevStart), "MMM d")} - ${format(parseISO(stats.prevEnd), "MMM d")}` : "Comparison period"}
          icon={<ArrowUpRight className="w-6 h-6" />}
          trend={trend}
          data-testid="stat-previous"
        />
      </div>

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold font-display">Earnings Over Time</h3>
          {periodDays > 120 && (
            <span className="text-xs text-muted-foreground">Weekly aggregation</span>
          )}
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} 
                dy={10}
                interval={periodDays > 60 ? Math.floor(chartData.length / 10) : 0}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} 
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  borderRadius: '8px', 
                  border: '1px solid hsl(var(--border))',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [formatCurrency(value), 'Earnings']}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--primary))" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorValue)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
