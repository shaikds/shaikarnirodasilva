"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: "",
  onValueChange: () => {},
});

function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange: controlledOnValueChange,
  className,
  children,
  ...props
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? "");
  const value = controlledValue ?? uncontrolledValue;
  const onValueChange = controlledOnValueChange ?? setUncontrolledValue;

  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  value,
  className,
  ...props
}: {
  value: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { value: selectedValue, onValueChange } = React.useContext(TabsContext);
  const isActive = selectedValue === value;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2",
        isActive
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-50"
          : "hover:text-slate-900 dark:hover:text-slate-50",
        className
      )}
      onClick={() => onValueChange(value)}
      {...props}
    />
  );
}

function TabsContent({
  value,
  className,
  ...props
}: {
  value: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { value: selectedValue } = React.useContext(TabsContext);
  if (selectedValue !== value) return null;

  return (
    <div
      className={cn("mt-2 focus-visible:outline-none focus-visible:ring-2", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
