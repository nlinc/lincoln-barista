const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const { defineSecret } = require('firebase-functions/params');
const geminiApiKey = defineSecret('BARISTA_GEMINI_KEY');

const getApiKey = () => geminiApiKey.value();

exports.analyzeShot = onCall({ secrets: [geminiApiKey] }, async (request) => {
    // Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Please log in to use AI analysis.");
    }

    const { shot, bean, machine } = request.data;
    
    try {
        const prompt = `You are an espresso history assistant for an experienced home barista. Summarize this shot as memory, not coaching:
        Bean: ${bean.name} (${bean.roastLevel} roast from ${bean.origin})
        Shot: ${shot.dose}g in, ${shot.yield}g out in ${shot.time}s.
        Machine Settings: ${machine.name} with ${machine.infusion}s infusion and ${machine.bloom}s rest.
        
        Give one concise sentence that helps the user remember where they left off with this bean. Do not give basic advice like "grind finer" unless the shot is obviously extreme.`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${getApiKey()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!res.ok) {
            console.error("Gemini API Error:", await res.text());
            return { text: "Memory summary is momentarily unavailable; your latest recipe is still saved." };
        }

        const data = await res.json();
        return { 
            text: data.candidates?.[0]?.content?.parts?.[0]?.text || "Shot quality identified.",
            source: "Gemini 1.5 Flash"
        };
    } catch (e) {
        console.error("AI Analysis error:", e);
        return { text: "Memory summary is momentarily unavailable; your latest recipe is still saved." };
    }
});

exports.getDailyTip = onCall({ secrets: [geminiApiKey] }, async (request) => {
    if (!request.auth) return { text: "Log in for daily tips." };

    try {
        const prompt = "You are a world-class barista. Give a 1-sentence interesting scientific tip about coffee beans, roasting, or espresso machine maintenance (like the Lelit Elizabeth). Keep it brief and professional.";
        
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${getApiKey()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await res.json();
        return { 
            text: data.candidates?.[0]?.content?.parts?.[0]?.text || "Grind finer for light roasts!",
            source: "Gemini 1.5 Flash"
        };
    } catch (e) {
        return { text: "Coffee is 98% water. Keep your machine clean!" };
    }
});
