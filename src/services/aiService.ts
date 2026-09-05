// AI Service — abstracts the AI provider
// Server-side via Convex action (keeps API keys safe)

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  text: string;
  error?: string;
}

// Call the Convex action for AI response
export async function getAIResponse(
  messages: AIMessage[],
): Promise<AIResponse> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_CONVEX_URL}/api/ai/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      },
    );

    if (!response.ok) {
      // Fallback: if Convex action not available, use client-side context
      return getClientSideResponse(messages);
    }

    const data = await response.json();
    return { text: data.text || data.response || "जवाब तैयार नहीं हो पाया।" };
  } catch {
    // Fallback to client-side contextual responses
    return getClientSideResponse(messages);
  }
}

// Client-side fallback — generates contextual responses from analysis data
// This works WITHOUT any API key for demo purposes
function getClientSideResponse(messages: AIMessage[]): AIResponse {
  const userMsg = messages.filter((m) => m.role === "user").pop()?.content || "";
  const contextMsg = messages.find((m) => m.role === "system")?.content || "";

  // Extract key data from context
  const scoreMatch = contextMsg.match(/Overall Score: (\d+)/);
  const verdictMatch = contextMsg.match(/Verdict: ([^\n]+)/);
  const businessMatch = contextMsg.match(/Business: ([^\n]+)/);
  const locationMatch = contextMsg.match(/Location: ([^\n]+)/);
  const capitalMatch = contextMsg.match(/Capital Contribution: ([^\n]+)/);
  const schemeMatch = contextMsg.match(/Scheme: ([^\n]+)/);
  const competitionMatch = contextMsg.match(/(\d+) competitors.*density: (\w+)/);
  const affordabilityMatch = contextMsg.match(/Affordability: (\w+)/);
  const riskMatch = contextMsg.match(/KEY RISKS:\n([\s\S]*?)(?=\n\n|$)/);

  const score = scoreMatch?.[1] || "71";
  const verdict = verdictMatch?.[1] || "Good Potential";
  const business = businessMatch?.[1] || "your business";
  const location = locationMatch?.[1] || "your area";
  const capital = capitalMatch?.[1] || "your contribution";
  const scheme = schemeMatch?.[1] || "applicable scheme";
  const competitors = competitionMatch?.[1] || "several";
  const density = competitionMatch?.[2] || "medium";
  const affordability = affordabilityMatch?.[1] || "comfortable";

  const lowerMsg = userMsg.toLowerCase();

  // Greeting
  if (lowerMsg.includes("namaste") || lowerMsg.includes("hello") || lowerMsg.includes("hi") || lowerMsg.includes("नमस्ते")) {
    return {
      text: `नमस्ते! मैं GramUdaan हूँ। मैं आपके ${business} analysis को समझ चुका हूँ। आप मुझसे अपने business, market, competition या finance से जुड़ा कोई भी सवाल पूछ सकते हैं।`,
    };
  }

  // Business recommendation
  if (lowerMsg.includes("business") && (lowerMsg.includes("अच्छा") || lowerMsg.includes("best") || lowerMsg.includes("suggest") || lowerMsg.includes("कौन सा"))) {
    return {
      text: `आपके current analysis के हिसाब से ${business} एक promising option लग रहा है। Feasibility score ${score}/100 है और verdict "${verdict}" है।\n\nMarket opportunity और competition balance अच्छा है। मेरी सलाह होगी कि पहले local customers से demand validate करें।`,
    };
  }

  // Risk
  if (lowerMsg.includes("risk") || lowerMsg.includes("जोखिम") || lowerMsg.includes("खतरा")) {
    const risks = riskMatch?.[1]?.split("\n").filter(Boolean).slice(0, 2) || [];
    return {
      text: `आपके ${business} में सबसे बड़े risks:\n\n${risks.length > 0 ? risks.map((r) => `• ${r.trim()}`).join("\n") : "• Supply dependency\n• Seasonal demand"}\n\nइन्हें manage करने का सबसे अच्छा तरीका है alternative suppliers identify करना और product range diversify करना।`,
    };
  }

  // EMI / Repayment
  if (lowerMsg.includes("emi") || lowerMsg.includes("repay") || lowerMsg.includes("किस्त") || lowerMsg.includes("loan")) {
    return {
      text: `आपके ${capital} contribution के आधार पर ${scheme} applicable है।\n\nMonthly repayment estimate आपकी affordability "${affordability}" range में है। Actual loan eligibility lender और documentation पर depend करेगी।\n\nक्या आप detailed financial breakdown देखना चाहेंगे?`,
    };
  }

  // Competition
  if (lowerMsg.includes("competition") || lowerMsg.includes("प्रतिस्पर्धा") || lowerMsg.includes("competitor")) {
    return {
      text: `आपके area में ${competitors} similar businesses हैं और competition density ${density} है।\n\nअलग दिखने के लिए: quality service, better pricing, ya additional products जैसे home delivery या credit facility try करें।`,
    };
  }

  // Government schemes
  if (lowerMsg.includes("scheme") || lowerMsg.includes("सरकारी") || lowerMsg.includes("mudra") || lowerMsg.includes("pmegp") || lowerMsg.includes("loan")) {
    return {
      text: `आपके project cost के हिसाब से ${scheme} applicable हो सकती है।\n\nMUDRA loan ₹10 lakh तक small businesses के लिए available है। PMEGP एक credit-linked subsidy scheme है।\n\nलेकिन actual eligibility आपकी category, location और documentation पर depend करेगी। DIC में जाकर जरूर verify करें।`,
    };
  }

  // Decision
  if (lowerMsg.includes("शुरू") || lowerMsg.includes("start") || lowerMsg.includes("should i") || lowerMsg.includes("करना चाहिए")) {
    return {
      text: `आपके analysis के हिसाब से "${verdict}" — score ${score}/100 है।\n\n${verdict === "Good Potential" ? "Market opportunity अच्छी है और financial structure viable लग रहा है।" : "कुछ risks हैं जिन्हें manage करना होगा।"}\n\nपहले step: 10-15 potential customers से demand validate करें, फिर investment finalize करें।`,
    };
  }

  // Pricing
  if (lowerMsg.includes("price") || lowerMsg.includes("दाम") || lowerMsg.includes("कितने में") || lowerMsg.includes("कीमत")) {
    return {
      text: `आपके business के लिए recommended pricing market average से slightly कम रखना चाहिए initially। इससे customers attract होंगे और aapko early traction मिलेगा।\n\nBadhiya service और consistent quality से धीरे-धीरे price increase कर सकते हैं।`,
    };
  }

  // Default response
  return {
    text: `यह एक अच्छा सवाल है। आपके ${business} (${location}) analysis के आधार पर, feasibility score ${score}/100 है।\n\nक्या आप specific कोई चीज़ जानना चाहते हैं — competition, risk, finance, या pricing? मैं detail में समझा सकता हूँ।`,
  };
}
