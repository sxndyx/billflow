import { useState } from "react";
import { useSessions, useCreateSession, useDeleteSession, useCopyLastWeek } from "@/hooks/use-sessions";
import { useClients } from "@/hooks/use-clients";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfWeek, addDays, isSameDay, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Trash2, Plus, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertWorkSessionSchema, type InsertWorkSession } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";

export default function Timesheet() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 })); // Sunday start
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  
  // Fetch sessions for the current week view context (optional optimization: fetch range)
  const { data: sessions, isLoading } = useSessions();
  const deleteSession = useDeleteSession();
  const copyLastWeek = useCopyLastWeek();

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

  const nextWeek = () => setCurrentWeekStart(addDays(currentWeekStart, 7));
  const prevWeek = () => setCurrentWeekStart(addDays(currentWeekStart, -7));

  const sessionsForDate = (date: Date) => {
    return sessions?.filter(s => isSameDay(new Date(s.date), date)) || [];
  };

  // Calculate previous week's sessions count for the confirmation modal
  const prevWeekStart = subDays(currentWeekStart, 7);
  const prevWeekEnd = addDays(prevWeekStart, 6);
  const prevWeekSessions = sessions?.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate >= prevWeekStart && sessionDate <= prevWeekEnd;
  }) || [];

  const handleCopyLastWeek = () => {
    copyLastWeek.mutate(
      { targetWeekStart: format(currentWeekStart, "yyyy-MM-dd") },
      {
        onSuccess: (data) => {
          setIsCopyDialogOpen(false);
          toast({
            title: "Sessions copied",
            description: `Created ${data.createdCount} sessions, skipped ${data.skippedCount} duplicates.`
          });
        },
        onError: (err: any) => {
          toast({
            title: "Failed to copy",
            description: err.message || "Could not copy last week's sessions",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-display">Timesheet</h1>
          <p className="text-muted-foreground text-sm mt-1">Track your work sessions.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={prevWeek} className="rounded-xl" data-testid="button-prev-week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[200px] justify-start text-left font-normal rounded-xl" data-testid="button-week-picker">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(currentWeekStart, "MMM d")} - {format(addDays(currentWeekStart, 6), "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={currentWeekStart}
                onSelect={(date) => date && setCurrentWeekStart(startOfWeek(date, { weekStartsOn: 0 }))}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={nextWeek} className="rounded-xl" data-testid="button-next-week">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setIsCopyDialogOpen(true)} 
            className="rounded-xl"
            data-testid="button-copy-last-week"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy last week
          </Button>
          <Button onClick={() => setIsLogOpen(true)} className="rounded-xl shadow-lg shadow-primary/20" data-testid="button-log-time">
            <Plus className="w-5 h-5 mr-2" />
            Log Time
          </Button>
        </div>
      </div>

      {/* Copy Last Week Confirmation Dialog */}
      <Dialog open={isCopyDialogOpen} onOpenChange={setIsCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy last week's schedule?</DialogTitle>
            <DialogDescription>
              This will copy {prevWeekSessions.length} session{prevWeekSessions.length !== 1 ? 's' : ''} from{' '}
              {format(prevWeekStart, "MMM d")} - {format(prevWeekEnd, "MMM d")} into the current week 
              ({format(currentWeekStart, "MMM d")} - {format(addDays(currentWeekStart, 6), "MMM d")}).
              Duplicate sessions will be skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCopyDialogOpen(false)} data-testid="button-cancel-copy">
              Cancel
            </Button>
            <Button 
              onClick={handleCopyLastWeek} 
              disabled={copyLastWeek.isPending}
              data-testid="button-confirm-copy"
            >
              {copyLastWeek.isPending ? "Copying..." : "Copy Sessions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Weekly Calendar Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const isToday = isSameDay(day, new Date());
          const daySessions = sessionsForDate(day);
          
          return (
            <div 
              key={day.toISOString()} 
              className={cn(
                "rounded-xl border p-3 flex flex-col min-h-0 transition-colors",
                isToday ? "bg-primary/5 border-primary/20" : "bg-card border-border/50"
              )}
            >
              <div className="text-center pb-2 border-b border-border/40 shrink-0">
                <p className={cn("text-xs font-medium uppercase", isToday ? "text-primary" : "text-muted-foreground")}>
                  {format(day, "EEE")}
                </p>
                <p className={cn("text-lg font-bold font-display", isToday ? "text-primary" : "text-foreground")}>
                  {format(day, "d")}
                </p>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 mt-2 pr-1">
                {isLoading ? (
                  <Skeleton className="h-14 w-full rounded-lg" />
                ) : (
                  daySessions.map(session => (
                    <div 
                      key={session.id}
                      className="bg-background p-2 rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all group relative text-xs w-full box-border"
                    >
                      <div className="font-semibold truncate max-w-full">
                        {session.client?.name || "Unknown Client"}
                      </div>
                      <div className="flex items-center text-[11px] text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3 mr-1 shrink-0" />
                        <span className="truncate">{session.startTime} - {session.endTime}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                          session.rateType === "senior" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        )}>
                          {session.rateType}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteSession.mutate(session.id)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <LogSessionDialog 
        open={isLogOpen} 
        onOpenChange={setIsLogOpen} 
        defaultDate={selectedDate}
      />
    </div>
  );
}

function LogSessionDialog({ open, onOpenChange, defaultDate }: { open: boolean, onOpenChange: (open: boolean) => void, defaultDate: Date }) {
  const { data: clients } = useClients();
  const { data: settings } = useSettings();
  const createSession = useCreateSession();

  const form = useForm<InsertWorkSession>({
    resolver: zodResolver(insertWorkSessionSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      startTime: "09:00",
      endTime: "17:00",
      durationMinutes: 480,
      rateType: "senior",
      hourlyRate: "30.00",
      notes: ""
    }
  });

  // Auto-calculate duration and rate
  const watchTimes = form.watch(["startTime", "endTime"]);
  const watchRateType = form.watch("rateType");

  // Effect to update duration when times change
  // Note: simplified logic, robust implementation needs more parsing
  
  // Effect to update rate when type changes
  const updateRate = (type: "junior" | "senior") => {
    if (settings) {
      const rate = type === "junior" ? settings.defaultJuniorRate : settings.defaultSeniorRate;
      if (rate) form.setValue("hourlyRate", rate.toString());
    }
  };

  const onSubmit = (data: InsertWorkSession) => {
    // Calculate duration before submit
    const [startH, startM] = data.startTime.split(':').map(Number);
    const [endH, endM] = data.endTime.split(':').map(Number);
    const duration = (endH * 60 + endM) - (startH * 60 + startM);
    
    createSession.mutate({
      ...data,
      durationMinutes: duration > 0 ? duration : 0
    }, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Work Session</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients?.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="rateType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rate Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(val: "junior" | "senior") => {
                        field.onChange(val);
                        updateRate(val);
                      }}
                      defaultValue={field.value}
                      className="flex gap-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="junior" />
                        </FormControl>
                        <FormLabel className="font-normal">Junior</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="senior" />
                        </FormControl>
                        <FormLabel className="font-normal">Senior</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="hourlyRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hourly Rate ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} className="rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} className="rounded-xl resize-none" placeholder="What did you work on?" value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
              <Button type="submit" disabled={createSession.isPending} className="rounded-xl">
                {createSession.isPending ? "Saving..." : "Log Session"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
