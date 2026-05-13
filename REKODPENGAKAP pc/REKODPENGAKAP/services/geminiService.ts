
import { GoogleGenAI } from "@google/genai";

export const generateBadgeInfo = async (badgeType: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Terangkan syarat-syarat utama untuk lulus Lencana Pengakap Kanak-Kanak: ${badgeType}.`,
      config: {
        systemInstruction: "Anda adalah jurulatih pengakap bertauliah. Berikan ringkasan pendek dan padat dalam Bahasa Melayu. Formatkan output sebagai senarai 'bullet points' menggunakan tag HTML <li> di dalam <ul>. Jangan gunakan Markdown.",
      },
    });
    return response.text || "Tiada maklumat diperolehi.";
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Gagal menghubungi AI.");
  }
};

export const analyzeData = async (summaryData: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Berikut adalah data pendaftaran mentah:\n${summaryData}`,
        config: {
            systemInstruction: "Anda adalah pembantu admin pengakap yang profesional. Analisis data yang diberikan dan sediakan laporan ringkas dalam Bahasa Melayu merangkumi: 1. Sekolah paling aktif, 2. Pecahan jantina, 3. Lencana paling popular. Gunakan nada yang menggalakkan. Formatkan jawapan menggunakan HTML ringkas (p, strong, ul, li) sahaja tanpa kod markdown.",
        }
    });
    return response.text || "Tiada analisis dapat dijana.";
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Gagal menganalisis data.");
  }
};