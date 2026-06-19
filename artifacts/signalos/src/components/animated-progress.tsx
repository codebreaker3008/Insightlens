import { useState, useEffect } from "react";
import { Terminal, Database, BrainCircuit, Activity, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const STEPS = [
  { id: 1, text: "Initializing analysis sequence...", icon: Terminal, delay: 0 },
  { id: 2, text: "Collecting Reddit discussions across communities...", icon: Database, delay: 2000 },
  { id: 3, text: "Gathering Google Play Store reviews...", icon: Database, delay: 5000 },
  { id: 4, text: "Processing unstructured feedback data...", icon: Activity, delay: 9000 },
  { id: 5, text: "Clustering signals and extracting intent...", icon: BrainCircuit, delay: 14000 },
  { id: 6, text: "Evaluating sentiment topology...", icon: BrainCircuit, delay: 19000 },
  { id: 7, text: "Generating actionable intelligence report...", icon: CheckCircle2, delay: 24000 },
];

export function AnimatedProgress({ query }: { query: string }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Progress bar animation
    const duration = 30000; // Expected max duration
    const interval = 100;
    const step = (100 / (duration / interval));
    
    const timer = setInterval(() => {
      setProgress(p => Math.min(p + step, 98)); // Hang at 98% until actually done
    }, interval);

    // Text steps animation
    const timeouts = STEPS.map((step, index) => 
      setTimeout(() => setCurrentStep(index), step.delay)
    );

    return () => {
      clearInterval(timer);
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h3 className="text-xl font-bold tracking-tight">Analyzing {query}</h3>
        <p className="text-sm text-muted-foreground font-mono">This usually takes 15-30 seconds. Do not close this window.</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-mono text-muted-foreground">
          <span>Processing Data</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="space-y-3 font-mono text-sm relative">
        <div className="absolute left-3 top-2 bottom-2 w-px bg-border/50 -z-10" />
        
        {STEPS.map((step, index) => {
          const isActive = index === currentStep;
          const isPast = index < currentStep;
          const Icon = step.icon;
          
          if (index > currentStep) return null;

          return (
            <div 
              key={step.id} 
              className={`flex items-start gap-4 transition-all duration-500 ${
                isActive ? "opacity-100 translate-x-0" : "opacity-40 translate-x-0"
              } animate-in slide-in-from-left-4 fade-in`}
            >
              <div className={`mt-0.5 rounded-full p-1 border ${
                isActive 
                  ? "bg-primary/20 border-primary/50 text-primary" 
                  : isPast 
                    ? "bg-muted border-muted-foreground/30 text-muted-foreground"
                    : "bg-transparent border-transparent text-transparent"
              }`}>
                <Icon className="size-3.5" />
              </div>
              <span className={`${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {step.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
