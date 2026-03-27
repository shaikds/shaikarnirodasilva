import Link from "next/link";
import { Zap, TrendingUp, Users, Mail, ArrowRight, BarChart3, Shield, Globe } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">TrendSupply</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex items-center justify-center py-20 md:py-32 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-900/30 px-4 py-1.5 mb-6 text-sm font-medium text-blue-700 dark:text-blue-400">
            <Zap className="h-4 w-4" />
            AI-Powered Supply Chain Intelligence
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Discover Trends.{" "}
            <span className="text-blue-600">Find Suppliers.</span>{" "}
            <br className="hidden md:block" />
            Automate Outreach.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto leading-relaxed">
            TrendSupply uses AI to detect emerging product trends from Reddit and Google Trends,
            match them with reliable suppliers, and automate your outreach - all in one platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center justify-center h-12 px-8 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors gap-2 w-full sm:w-auto"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center h-12 px-8 rounded-lg border border-slate-200 dark:border-slate-800 font-medium hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors w-full sm:w-auto"
            >
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Everything You Need</h2>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              From trend detection to supplier outreach, we handle the entire pipeline.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: TrendingUp,
                title: "Trend Detection",
                description:
                  "Real-time monitoring of Reddit and Google Trends to identify emerging product opportunities before they go mainstream.",
                color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600",
              },
              {
                icon: Users,
                title: "Supplier Matching",
                description:
                  "Automatically find and score suppliers from local directories and Alibaba, prioritizing local sources for faster delivery.",
                color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600",
              },
              {
                icon: Mail,
                title: "Automated Outreach",
                description:
                  "Send personalized emails and WhatsApp messages to matched suppliers with AI-generated templates.",
                color: "bg-purple-100 dark:bg-purple-900/30 text-purple-600",
              },
              {
                icon: BarChart3,
                title: "Analytics Dashboard",
                description:
                  "Track trend volume, growth rates, supplier reliability scores, and outreach success rates in real-time.",
                color: "bg-amber-100 dark:bg-amber-900/30 text-amber-600",
              },
              {
                icon: Shield,
                title: "Reliability Scoring",
                description:
                  "AI-powered supplier scoring system rates reliability from 0-100 based on response rates, reviews, and verification status.",
                color: "bg-red-100 dark:bg-red-900/30 text-red-600",
              },
              {
                icon: Globe,
                title: "Local-First Sourcing",
                description:
                  "Prioritize local suppliers for faster lead times and lower shipping costs, with international options as backup.",
                color: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 hover:shadow-md transition-shadow"
              >
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg mb-4 ${feature.color}`}>
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Ready to find your next winning product?
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
            Join TrendSupply today and get instant access to trend intelligence and supplier matching.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center h-12 px-8 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors gap-2"
          >
            Get Started for Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-blue-600">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold">TrendSupply</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            2026 TrendSupply. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
