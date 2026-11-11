import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Target, Trash2, Pencil, Calendar } from "lucide-react";
import { format, parseISO, addWeeks, differenceInWeeks, startOfWeek } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Goal } from "@shared/schema";
import { api } from "@shared/routes";

function ProgressWheel({ percent, size = 120, strokeWidth = 10 }: { percent: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{Math.round(percent)}%</span>
      </div>
    </div>
  );
}

function GoalCard({ goal, onEdit, onDelete }: { goal: Goal; onEdit: (g: Goal) => void; onDelete: (id: number) => void }) {
  const targetDollars = goal.targetAmountCents / 100;
  const weeklySavingsDollars = goal.weeklySavingsCents / 100;
  
  const startDate = parseISO(goal.startDate);
  const now = new Date();
  const weeksSinceStart = Math.max(0, differenceInWeeks(now, startDate));
  
  const savedCents = Math.min(weeksSinceStart * goal.weeklySavingsCents, goal.targetAmountCents);
  const savedDollars = savedCents / 100;
  const remainingDollars = targetDollars - savedDollars;
  const percent = (savedCents / goal.targetAmountCents) * 100;
  
  const weeksRemaining = weeklySavingsDollars > 0 ? Math.ceil(remainingDollars / weeklySavingsDollars) : 0;
  const etaDate = addWeeks(now, weeksRemaining);

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">{goal.title}</CardTitle>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(goal)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(goal.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardDescription className="flex items-center gap-1 text-xs">
          <Calendar className="w-3 h-3" />
          Started {format(startDate, "MMM d, yyyy")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-6 pt-2">
        <ProgressWheel percent={percent} />
        <div className="flex-1 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Saved</span>
            <span className="font-semibold">${savedDollars.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Target</span>
            <span className="font-semibold">${targetDollars.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-semibold text-primary">${remainingDollars.toFixed(2)}</span>
          </div>
          <div className="pt-2 border-t border-border/50">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Weekly savings</span>
              <span>${weeklySavingsDollars.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Weeks remaining</span>
              <span>{weeksRemaining}</span>
            </div>
            {percent < 100 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">ETA</span>
                <span className="font-medium text-primary">{format(etaDate, "MMM d, yyyy")}</span>
              </div>
            )}
            {percent >= 100 && (
              <div className="mt-2 text-center text-sm font-medium text-green-600 dark:text-green-400">
                Goal Complete!
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Goals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [title, setTitle] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [weeklySavings, setWeeklySavings] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isFortnightly, setIsFortnightly] = useState(false);

  const { data: goals, isLoading } = useQuery({
    queryKey: [api.goals.list.path],
    queryFn: async () => {
      const res = await fetch(api.goals.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json() as Promise<Goal[]>;
    },
  });

  const createGoal = useMutation({
    mutationFn: async (data: { title: string; targetAmountCents: number; weeklySavingsCents: number; startDate: string }) => {
      const res = await apiRequest("POST", api.goals.create.path, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.goals.list.path] });
      toast({ title: "Goal created!" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateGoal = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Goal> }) => {
      const res = await apiRequest("PUT", `/api/goals/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.goals.list.path] });
      toast({ title: "Goal updated!" });
      closeDialog();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/goals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.goals.list.path] });
      toast({ title: "Goal deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openCreateDialog = () => {
    setEditingGoal(null);
    setTitle("");
    setTargetAmount("");
    setWeeklySavings("");
    setStartDate(format(new Date(), "yyyy-MM-dd"));
    setIsFortnightly(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (goal: Goal) => {
    setEditingGoal(goal);
    setTitle(goal.title);
    setTargetAmount((goal.targetAmountCents / 100).toString());
    setWeeklySavings((goal.weeklySavingsCents / 100).toString());
    setStartDate(goal.startDate);
    setIsFortnightly(false);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingGoal(null);
  };

  const handleSubmit = () => {
    const targetCents = Math.round(parseFloat(targetAmount) * 100);
    let weeklyCents = Math.round(parseFloat(weeklySavings) * 100);
    if (isFortnightly) weeklyCents = Math.round(weeklyCents / 2);

    if (!title.trim() || isNaN(targetCents) || isNaN(weeklyCents) || targetCents <= 0 || weeklyCents <= 0) {
      toast({ title: "Invalid input", description: "Please fill all fields correctly", variant: "destructive" });
      return;
    }

    const data = {
      title: title.trim(),
      targetAmountCents: targetCents,
      weeklySavingsCents: weeklyCents,
      startDate,
    };

    if (editingGoal) {
      updateGoal.mutate({ id: editingGoal.id, data });
    } else {
      createGoal.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20 md:pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display">Goals</h1>
          <p className="text-muted-foreground mt-1">Track your savings goals and progress.</p>
        </div>
        <Button onClick={openCreateDialog} className="rounded-xl shadow-lg shadow-primary/20" data-testid="button-create-goal">
          <Plus className="w-5 h-5 mr-2" />
          New Goal
        </Button>
      </div>

      {goals?.length === 0 ? (
        <Card className="p-12 text-center">
          <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No goals yet</h3>
          <p className="text-muted-foreground mb-4">Create your first savings goal to start tracking progress.</p>
          <Button onClick={openCreateDialog}>Create Goal</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals?.map(goal => (
            <GoalCard 
              key={goal.id} 
              goal={goal} 
              onEdit={openEditDialog} 
              onDelete={(id) => deleteGoal.mutate(id)} 
            />
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Edit Goal" : "Create Goal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="New laptop, Vacation, etc."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl mt-1"
                data-testid="input-goal-title"
              />
            </div>
            <div>
              <Label htmlFor="target">Target Amount ($)</Label>
              <Input
                id="target"
                type="number"
                placeholder="2000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="rounded-xl mt-1"
                data-testid="input-goal-target"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="savings">{isFortnightly ? "Fortnightly" : "Weekly"} Savings ($)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6"
                  onClick={() => setIsFortnightly(!isFortnightly)}
                >
                  Switch to {isFortnightly ? "weekly" : "fortnightly"}
                </Button>
              </div>
              <Input
                id="savings"
                type="number"
                placeholder={isFortnightly ? "400" : "200"}
                value={weeklySavings}
                onChange={(e) => setWeeklySavings(e.target.value)}
                className="rounded-xl"
                data-testid="input-goal-savings"
              />
            </div>
            <div>
              <Label htmlFor="start">Start Date</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl mt-1"
                data-testid="input-goal-start"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} className="rounded-xl">Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createGoal.isPending || updateGoal.isPending}
              className="rounded-xl"
              data-testid="button-save-goal"
            >
              {createGoal.isPending || updateGoal.isPending ? "Saving..." : "Save Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
