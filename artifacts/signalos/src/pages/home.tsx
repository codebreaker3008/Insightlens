import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAnalyzeProduct, useListReports } from "@workspace/api-client-react";
import { Search, History, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout";
import { AnimatedProgress } from "@/components/animated-progress";
import { format } from "date-fns";

const EXAMPLES = ["Spotify", "Notion", "Uber", "Lenskart", "Swiggy", "Zomato", "Slack"];

export function Home() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  
  const analyze = useAnalyzeProduct();
  const { data: recentReports, isLoading: isReportsLoading } = useListReports();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    analyze.mutate(
      { data: { query: query.trim() } },
      {
        onSuccess: (report) => {
          setLocation(`/report/${report.id}`);
        },
      }
    );
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
  };

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] max-w-4xl mx-auto w-full py-12">
        <div className="text-center mb-12 space-y-4">
          <Badge variant="outline" className="mb-4 px-3 py-1 font-mono text-xs uppercase tracking-wider border-primary/30 text-primary bg-primary/5">
            SignalOS Terminal v1.0
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
            Stop guessing what customers want.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Analyze what the internet is saying about any product. 
            Deep, evidence-backed reports from Reddit discussions and Play Store reviews.
          </p>
        </div>

        {analyze.isPending ? (
          <div className="w-full max-w-2xl p-8 border border-border/50 rounded-xl bg-card/50 backdrop-blur-sm shadow-2xl">
            <AnimatedProgress query={query} />
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-8">
            <form onSubmit={handleSearch} className="relative group">
              <div className="absolute inset-0 bg-primary/20 rounded-xl blur-xl transition-all duration-500 group-hover:bg-primary/30 opacity-50" />
              <div className="relative flex items-center bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden transition-all duration-300 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50">
                <Search className="ml-4 size-5 text-muted-foreground" />
                <Input
                  autoFocus
                  type="text"
                  placeholder="Enter a product name e.g. Spotify, Notion, Uber"
                  className="border-0 bg-transparent h-14 text-lg focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={analyze.isPending}
                />
                <Button 
                  type="submit" 
                  size="lg"
                  className="mr-2 px-8 h-10 font-medium"
                  disabled={!query.trim() || analyze.isPending}
                >
                  {analyze.isPending ? <Loader2 className="size-4 animate-spin" /> : "Analyze"}
                </Button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground mr-2 font-mono">Try:</span>
              {EXAMPLES.map((example) => (
                <Badge
                  key={example}
                  variant="secondary"
                  className="cursor-pointer hover:bg-secondary/80 transition-colors px-3 py-1 font-medium bg-secondary/40"
                  onClick={() => handleExampleClick(example)}
                >
                  {example}
                </Badge>
              ))}
            </div>

            {recentReports && recentReports.length > 0 && (
              <div className="mt-16 pt-8 border-t border-border/40">
                <div className="flex items-center gap-2 mb-6 text-muted-foreground">
                  <History className="size-4" />
                  <h3 className="font-medium font-mono text-sm tracking-wide uppercase">Recent Intel</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {recentReports.slice(0, 4).map((report) => (
                    <Card 
                      key={report.id} 
                      className="group cursor-pointer hover:border-primary/40 transition-all duration-300 bg-card/40 hover:bg-card/80"
                      onClick={() => setLocation(`/report/${report.id}`)}
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{report.query}</CardTitle>
                          <ArrowRight className="size-4 text-muted-foreground opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                        </div>
                        <CardDescription className="text-xs">
                          {format(new Date(report.createdAt), 'MMM d, yyyy')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-2">
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <div className={`size-2 rounded-full ${
                              report.overallSentiment.toLowerCase().includes('positive') ? 'bg-chart-1' :
                              report.overallSentiment.toLowerCase().includes('negative') ? 'bg-chart-3' : 'bg-chart-4'
                            }`} />
                            <span className="text-muted-foreground capitalize">{report.overallSentiment}</span>
                          </div>
                          <div className="text-muted-foreground font-mono text-xs">
                            {report.totalDataPoints.toLocaleString()} signals
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
