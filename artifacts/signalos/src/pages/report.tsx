import { useParams, useLocation } from "wouter";
import { useGetReport, useAnalyzeProduct, getGetReportQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RefreshCw, Database, MessageSquare, Star, TrendingUp, AlertTriangle, Lightbulb, Bot, ExternalLink, ArrowLeft } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { format } from "date-fns";

export function ReportView() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = params.id as string;
  
  const { data: report, isLoading, isError, refetch } = useGetReport(id, {
    query: {
      queryKey: getGetReportQueryKey(id),
      retry: false,
    }
  });
  
  const analyze = useAnalyzeProduct();

  const handleReanalyze = () => {
    if (!report?.query) return;
    analyze.mutate(
      { data: { query: report.query, forceRefresh: true } },
      {
        onSuccess: (newReport) => {
          if (newReport.id !== id) {
            setLocation(`/report/${newReport.id}`);
          } else {
            refetch();
          }
        }
      }
    );
  };

  if (isLoading || analyze.isPending) {
    return (
      <Layout>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-8">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
            <div className="space-y-8">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-80 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !report) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
          <AlertTriangle className="size-12 text-destructive mb-2" />
          <h2 className="text-2xl font-bold">Report Not Found</h2>
          <p className="text-muted-foreground max-w-md">We couldn't load the intelligence report for this product. It may have expired or the ID is invalid.</p>
          <Button onClick={() => setLocation("/")} variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 size-4" />
            Return Home
          </Button>
        </div>
      </Layout>
    );
  }

  const sentimentData = [
    { name: 'Positive', value: report.sentiment.positive, color: 'hsl(var(--chart-1))' },
    { name: 'Neutral', value: report.sentiment.neutral, color: 'hsl(var(--chart-2))' },
    { name: 'Negative', value: report.sentiment.negative, color: 'hsl(var(--chart-3))' },
  ];

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500 pb-16 min-w-0 w-full">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
              <span className="font-mono">{report.id.substring(0, 8)}</span>
              <span>•</span>
              <span>Generated {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 break-words">
              {report.query}
            </h1>
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-mono uppercase tracking-wider border-border text-muted-foreground min-w-0 max-w-xs overflow-hidden">
                <span className="shrink-0 mr-1">Overall:</span>
                <span className="font-bold text-foreground truncate">{report.executiveSummary.overallSentiment}</span>
              </div>
              <Badge variant="secondary" className="text-xs font-mono shrink-0">
                {report.dataSourceStats.totalDataPoints.toLocaleString()} Signals
              </Badge>
            </div>
          </div>
          
          <Button 
            onClick={handleReanalyze} 
            variant="outline" 
            className="shrink-0"
            disabled={analyze.isPending}
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh Intel
          </Button>
        </div>

        {/* Data Sources Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                <Database className="size-3.5" /> Total Analyzed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{report.dataSourceStats.totalDataPoints.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="size-3.5" /> Reddit Threads
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{(report.dataSourceStats.redditPosts + report.dataSourceStats.redditComments).toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                <Star className="size-3.5" /> Play Store Reviews
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{report.dataSourceStats.playStoreReviews.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Executive Summary */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-5 text-primary" />
                  Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold mb-2 uppercase tracking-wide text-muted-foreground">AI Verdict</h4>
                  <p className="text-lg leading-relaxed font-medium">{report.aiVerdict}</p>
                </div>
                
                <Separator className="bg-primary/10" />
                
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">Key Observations</h4>
                    <ul className="space-y-2">
                      {report.executiveSummary.keyObservations.map((obs, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <div className="mt-1 size-1.5 rounded-full bg-primary shrink-0" />
                          <span className="leading-snug">{obs}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">Main Concerns</h4>
                    <ul className="space-y-2">
                      {report.executiveSummary.mainConcerns.map((concern, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <div className="mt-1 size-1.5 rounded-full bg-destructive shrink-0" />
                          <span className="leading-snug">{concern}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Opportunity Engine */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="size-5 text-chart-4" />
                <h2 className="text-2xl font-bold tracking-tight">Opportunity Engine</h2>
              </div>
              <p className="text-muted-foreground mb-4">Gaps in the market identified from customer frustration.</p>
              
              <div className="space-y-4">
                {report.opportunities.map((opp, i) => (
                  <Card key={i} className="relative border-border/50 overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-chart-4" />
                    <CardHeader className="pb-3 pl-6">
                      <div className="flex justify-between items-start gap-4 min-w-0">
                        <div className="min-w-0">
                          <Badge className="mb-2 bg-chart-4/10 text-chart-4 hover:bg-chart-4/20 border-chart-4/20">
                            {opp.severity} Severity
                          </Badge>
                          <CardTitle className="text-lg break-words">{opp.opportunity}</CardTitle>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-2xl font-bold">{opp.mentions}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Signals</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pl-6 space-y-4">
                      <div className="bg-muted/30 p-3 rounded-md border border-border/40 text-sm break-words">
                        <span className="font-semibold text-muted-foreground mr-2 uppercase text-xs tracking-wider">Problem:</span>
                        {opp.problem}
                      </div>
                      <div className="text-sm break-words">
                        <span className="font-semibold text-muted-foreground mr-2 uppercase text-xs tracking-wider">Impact:</span>
                        {opp.potentialImpact}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Top Complaints */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="size-5 text-destructive" />
                <h2 className="text-2xl font-bold tracking-tight">Top Complaints</h2>
              </div>
              
              <Accordion type="single" collapsible className="w-full">
                {report.topComplaints.map((complaint, i) => (
                  <AccordionItem key={i} value={`complaint-${i}`} className="border-border/50 bg-card rounded-lg mb-2 px-1">
                    <AccordionTrigger className="hover:no-underline px-4 py-3">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex flex-col items-start gap-1 text-left">
                          <span className="font-semibold text-base">{complaint.title}</span>
                          <span className="text-xs text-muted-foreground font-mono">{complaint.severity} • {complaint.mentionCount} mentions</span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Raw Evidence</h4>
                        {complaint.evidence.map((ev, j) => (
                          <EvidenceCard key={j} evidence={ev} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* Feature Requests */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="size-5 text-chart-1" />
                <h2 className="text-2xl font-bold tracking-tight">Feature Requests</h2>
              </div>
              
              <Accordion type="single" collapsible className="w-full">
                {report.featureRequests.map((req, i) => (
                  <AccordionItem key={i} value={`req-${i}`} className="border-border/50 bg-card rounded-lg mb-2 px-1">
                    <AccordionTrigger className="hover:no-underline px-4 py-3">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex flex-col items-start gap-1 text-left">
                          <span className="font-semibold text-base">{req.title}</span>
                          <span className="text-xs text-muted-foreground font-mono">Importance: {req.estimatedImportance} • {req.frequency} mentions</span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Raw Evidence</h4>
                        {req.evidence.map((ev, j) => (
                          <EvidenceCard key={j} evidence={ev} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

          </div>

          {/* Sidebar Column */}
          <div className="space-y-8">
            
            {/* Sentiment Chart */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg">Sentiment Topology</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sentimentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {sentimentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value) => [`${value}%`, 'Sentiment']}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Strategic Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {report.recommendations.map((rec, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm leading-tight">{rec.title}</h4>
                      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">{rec.priority}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.why}</p>
                    <div className="text-xs font-medium text-chart-1 bg-chart-1/10 px-2 py-1 rounded inline-block">
                      Impact: {rec.expectedImpact}
                    </div>
                    {i < report.recommendations.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Competitors */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Competitor Radar</CardTitle>
                <CardDescription>Who users compare this to</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.competitorMentions.map((comp, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="font-medium">{comp.name}</div>
                      <Badge variant="secondary" className="font-mono">{comp.mentionCount} mentions</Badge>
                    </div>
                  ))}
                  {report.competitorMentions.length === 0 && (
                    <div className="text-sm text-muted-foreground">No significant competitor mentions found.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Customer Praise */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-chart-1">What Users Love</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.customerPraise.map((praise, i) => (
                    <div key={i} className="space-y-1">
                      <div className="font-medium text-sm">{praise.title}</div>
                      <div className="text-xs text-muted-foreground font-mono">{praise.frequency} mentions</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </Layout>
  );
}

const REVIEW_PLATFORMS = new Set(["G2", "Capterra", "TrustRadius", "Product Hunt"]);

function platformLabel(subreddit: string): string {
  return REVIEW_PLATFORMS.has(subreddit) ? subreddit : `r/${subreddit}`;
}

function EvidenceCard({ evidence }: { evidence: any }) {
  return (
    <div className="bg-muted/40 p-3 rounded-md border border-border/40 text-sm space-y-2 min-w-0 w-full overflow-hidden">
      <p className="italic text-muted-foreground leading-relaxed break-words overflow-hidden">"{evidence.text}"</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono min-w-0">
        <Badge variant="outline" className="bg-background text-[10px] px-1.5 py-0 shrink-0">
          {evidence.source}
        </Badge>
        {evidence.rating && <span className="text-chart-4 shrink-0">★ {evidence.rating}/5</span>}
        {evidence.subreddit && <span className="shrink-0">{platformLabel(evidence.subreddit)}</span>}
        {evidence.date && <span className="shrink-0 text-muted-foreground/60">{evidence.date.slice(0, 10)}</span>}
        {evidence.url && (
          <a href={evidence.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center ml-auto shrink-0">
            Source <ExternalLink className="size-3 ml-1" />
          </a>
        )}
      </div>
    </div>
  );
}
