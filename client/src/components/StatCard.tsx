import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function StatCard({ title, value, description, icon, trend, className }: StatCardProps) {
  return (
    <div className={cn(
      "bg-card rounded-2xl p-6 border border-border/50 shadow-sm",
      "hover:shadow-lg hover:border-primary/20 transition-all duration-300",
      className
    )}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <h3 className="text-3xl font-display font-bold text-foreground tracking-tight">{value}</h3>
          {description && (
            <p className={cn(
              "text-sm mt-2",
              trend === "up" ? "text-green-600" : 
              trend === "down" ? "text-red-600" : "text-muted-foreground"
            )}>
              {description}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-3 bg-secondary/50 rounded-xl text-primary">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
