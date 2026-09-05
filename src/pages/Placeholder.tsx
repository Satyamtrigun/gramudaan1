import { Navbar } from "@/components/Navbar";
import { Link } from "react-router";
import { ArrowLeft, Construction } from "lucide-react";

const placeholderData: Record<string, { title: string; titleHi: string; description: string }> = {
  advisor: {
    title: "AI Business Advisor",
    titleHi: "AI व्यापार सलाहकार",
    description: "Get personalized business advice from our AI assistant. Ask questions about your market, competitors, pricing and financing — and receive clear, simple guidance in your language.",
  },
  report: {
    title: "Business Feasibility Report",
    titleHi: "व्यापार व्यवहार्यता रिपोर्ट",
    description: "Download a complete report of your feasibility analysis, including market data, risk assessment, financial overview and recommendations — ready to share with bank officers or partners.",
  },
  saved: {
    title: "Saved Assessments",
    titleHi: "सहेजी गई रिपोर्ट",
    description: "View and manage all your previously saved assessments. Compare different business ideas and locations side by side to find your best option.",
  },
  settings: {
    title: "Settings",
    titleHi: "सेटिंग्स",
    description: "Manage your profile, language preferences and notification settings.",
  },
};

interface PlaceholderProps {
  type?: string;
}

export default function PlaceholderPage({ type = "default" }: PlaceholderProps) {
  const data = placeholderData[type] || {
    title: "Coming Soon",
    titleHi: "जल्द आ रहा है",
    description: "This feature is under development and will be available in a future version of GramUdaan.",
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar variant="app" />
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{data.title}</h1>
          <p className="text-xs text-primary/60 font-medium mt-1">{data.titleHi}</p>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            {data.description}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            Coming in a future version of GramUdaan
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
