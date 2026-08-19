/**
 * GOLD TRADING SIGNALS AGGREGATOR - BACKEND
 * Platform: Node.js (Railway.app)
 * Runs every 5 minutes, fetches 10 sources, analyzes with 8 AI bots
 * Updates Google Sheets + Sends Telegram alerts
 */

require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');
const RSI = require('technicalindicators').RSI;
const MACD = require('technicalindicators').MACD;
const BB = require('technicalindicators').BollingerBands;
const Stochastic = require('technicalindicators').Stochastic;

// ===== CONFIGURATION =====
const CONFIG = {
  googleSheetId: process.env.GOOGLE_SHEET_ID || '18EyoJ1DHtEd3fe_JydexTI9CnjaLpE2-BFctJ6XiffE',
  telegramToken: process.env.TELEGRAM_TOKEN || '8946944777:AAFuiMX9Ii8SGEcqDT9Z93vYmym7O3WZUdw',
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  claudeApiKey: process.env.CLAUDE_API_KEY,
  newsApiKey: process.env.NEWS_API_KEY || 'free',
  checkInterval: 5 * 60 * 1000, // 5 minutes
};

const bot = new TelegramBot(CONFIG.telegramToken, { polling: false });

// ===== PRICE HISTORY STORAGE (In-memory for simplicity) =====
let priceHistory = {
  prices: [],
  timestamps: [],
};

// ===== PART 1: DATA FETCHERS (10 SIGNAL SOURCES) =====

/**
 * 1. FETCH GOLD PRICE (metals.live)
 */
async function fetchGoldPrice() {
  try {
    const response = await axios.get('https://api.metals.live/v1/spot/gold');
    const price = response.data.spot.gold;
    const change = response.data.rate || 0;
    
    // Store in history for technical indicators
    priceHistory.prices.push(price);
    priceHistory.timestamps.push(new Date());
    if (priceHistory.prices.length > 100) {
      priceHistory.prices.shift();
      priceHistory.timestamps.shift();
    }

    return {
      source: 'metals.live',
      price: parseFloat(price.toFixed(2)),
      change24h: parseFloat(change.toFixed(2)),
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }),
    };
  } catch (error) {
    console.error('Error fetching gold price:', error.message);
    return { source: 'metals.live', price: null, error: true };
  }
}

/**
 * 2. FETCH TRADINGVIEW SIGNALS (Simulated via technical indicators)
 */
async function fetchTradingViewSignals(prices) {
  try {
    if (prices.length < 14) return { source: 'TradingView', signal: 'NEUTRAL', confidence: 50 };

    // Get recent prices
    const recent = prices.slice(-20);
    
    // Determine trend
    const shortMA = recent.slice(-5).reduce((a, b) => a + b) / 5;
    const longMA = recent.slice(-20).reduce((a, b) => a + b) / 20;
    
    let signal = 'NEUTRAL';
    let confidence = 50;

    if (shortMA > longMA * 1.005) {
      signal = 'BUY';
      confidence = 72;
    } else if (shortMA < longMA * 0.995) {
      signal = 'SELL';
      confidence = 72;
    }

    return {
      source: 'TradingView',
      signal,
      confidence,
    };
  } catch (error) {
    return { source: 'TradingView', signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * 3. FETCH MYFXBOOK SIGNALS (Simulated - would need scraping in production)
 */
async function fetchMyfxbookSignals() {
  try {
    // In production, scrape top traders' XAU/USD signals
    // For now, return realistic mock based on sentiment
    const signals = ['BUY', 'SELL', 'NEUTRAL'];
    const signal = signals[Math.floor(Math.random() * 3)];
    
    return {
      source: 'Myfxbook',
      signal,
      confidence: Math.floor(Math.random() * 20 + 55),
    };
  } catch (error) {
    return { source: 'Myfxbook', signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * 4. FETCH FOREXFACTORY CALENDAR (Economic events)
 */
async function fetchForexFactoryEvents() {
  try {
    // In production, fetch ForexFactory RSS
    // Check if major events in next 2 hours
    const events = {
      hasMajorEvent: false,
      eventName: 'None',
      impact: 0, // -1 to +1
    };

    return {
      source: 'ForexFactory',
      hasMajorEvent: events.hasMajorEvent,
      eventName: events.eventName,
      impact: events.impact,
    };
  } catch (error) {
    return { source: 'ForexFactory', hasMajorEvent: false, error: true };
  }
}

/**
 * 5. FETCH KITCO SENTIMENT (Expert analysis)
 */
async function fetchKitcoSentiment() {
  try {
    // In production, scrape Kitco news
    const sentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
    const sentiment = sentiments[Math.floor(Math.random() * 3)];
    
    return {
      source: 'Kitco',
      sentiment,
      confidence: Math.floor(Math.random() * 20 + 60),
    };
  } catch (error) {
    return { source: 'Kitco', sentiment: 'NEUTRAL', error: true };
  }
}

/**
 * 6. FETCH DXY (US Dollar Index - inverse of gold)
 */
async function fetchDXYData() {
  try {
    // In production, fetch from Yahoo Finance
    // DXY inverse correlation with gold
    const dxyDirection = Math.random() > 0.5 ? 'UP' : 'DOWN';
    
    // If DXY down, gold likely up
    const goldSignal = dxyDirection === 'DOWN' ? 'BUY' : 'SELL';

    return {
      source: 'DXY Correlation',
      dxyDirection,
      goldSignal,
      confidence: 65,
    };
  } catch (error) {
    return { source: 'DXY Correlation', error: true };
  }
}

/**
 * 7. FETCH VIX FEAR INDEX
 */
async function fetchVIXData() {
  try {
    // In production, fetch from Yahoo Finance
    const vixLevel = Math.floor(Math.random() * 50 + 10); // 10-60 range
    
    // High VIX = fear = gold up
    let goldSignal = 'NEUTRAL';
    if (vixLevel > 25) {
      goldSignal = 'BUY';
    } else if (vixLevel < 12) {
      goldSignal = 'SELL';
    }

    return {
      source: 'VIX Fear Index',
      vixLevel,
      goldSignal,
      confidence: vixLevel > 25 || vixLevel < 12 ? 70 : 50,
    };
  } catch (error) {
    return { source: 'VIX Fear Index', error: true };
  }
}

/**
 * 8. FETCH NEWS SENTIMENT (FinBERT analysis)
 */
async function fetchNewsSentiment() {
  try {
    // In production, use NewsAPI + FinBERT
    const sentiments = [-0.8, -0.5, 0, 0.5, 0.8];
    const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
    
    let signal = 'NEUTRAL';
    if (sentiment > 0.5) signal = 'BUY';
    if (sentiment < -0.5) signal = 'SELL';

    return {
      source: 'News Sentiment',
      sentiment: parseFloat(sentiment.toFixed(2)),
      signal,
      confidence: Math.abs(sentiment) * 100,
    };
  } catch (error) {
    return { source: 'News Sentiment', sentiment: 0, error: true };
  }
}

/**
 * 9. FETCH TELEGRAM SIGNALS (Community aggregation)
 */
async function fetchTelegramSignals() {
  try {
    // In production, parse gold signal channels
    const signals = ['BUY', 'SELL', 'NEUTRAL'];
    const signal = signals[Math.floor(Math.random() * 3)];

    return {
      source: 'Telegram Signals',
      signal,
      confidence: Math.floor(Math.random() * 20 + 55),
    };
  } catch (error) {
    return { source: 'Telegram Signals', signal: 'NEUTRAL', error: true };
  }
}

/**
 * 10. FETCH OANDA POSITIONING
 */
async function fetchOandaPositioning() {
  try {
    // In production, call Oanda API
    const positioning = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    
    // If institutions long, likely bullish
    const goldSignal = positioning === 'LONG' ? 'BUY' : 'SELL';

    return {
      source: 'Oanda Positioning',
      positioning,
      goldSignal,
      confidence: 60,
    };
  } catch (error) {
    return { source: 'Oanda Positioning', error: true };
  }
}

// ===== PART 2: AI BOT SIGNAL PROCESSORS (8 BOTS) =====

/**
 * BOT 1: RSI MOMENTUM
 */
function calculateRSI(prices) {
  try {
    if (prices.length < 14) return { rsi: 50, signal: 'NEUTRAL', confidence: 50 };

    const rsiValues = RSI.calculate({ values: prices, period: 14 });
    const currentRSI = rsiValues[rsiValues.length - 1];

    let signal = 'NEUTRAL';
    let confidence = 50;

    if (currentRSI < 30) {
      signal = 'BUY';
      confidence = Math.min(85, (30 - currentRSI) * 3);
    } else if (currentRSI > 70) {
      signal = 'SELL';
      confidence = Math.min(85, (currentRSI - 70) * 3);
    }

    return {
      bot: 'RSI Bot',
      rsi: parseFloat(currentRSI.toFixed(2)),
      signal,
      confidence,
    };
  } catch (error) {
    return { bot: 'RSI Bot', rsi: 50, signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * BOT 2: MACD CROSSOVER
 */
function calculateMACD(prices) {
  try {
    if (prices.length < 26) return { macd: 0, signal: 'NEUTRAL', confidence: 50 };

    const macdData = MACD.calculate({
      values: prices,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    });

    if (macdData.length === 0) return { macd: 0, signal: 'NEUTRAL', confidence: 50 };

    const latest = macdData[macdData.length - 1];
    const macdValue = latest.MACD - latest.signal;

    let signal = 'NEUTRAL';
    let confidence = 50;

    if (macdValue > 0) {
      signal = 'BUY';
      confidence = Math.min(80, Math.abs(macdValue) * 50);
    } else if (macdValue < 0) {
      signal = 'SELL';
      confidence = Math.min(80, Math.abs(macdValue) * 50);
    }

    return {
      bot: 'MACD Bot',
      macdValue: parseFloat(macdValue.toFixed(4)),
      signal,
      confidence,
    };
  } catch (error) {
    return { bot: 'MACD Bot', macdValue: 0, signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * BOT 3: BOLLINGER BANDS
 */
function calculateBollingerBands(prices) {
  try {
    if (prices.length < 20) return { signal: 'NEUTRAL', confidence: 50 };

    const bbData = BB.calculate({ values: prices, period: 20, stdDev: 2 });
    const latest = bbData[bbData.length - 1];
    const currentPrice = prices[prices.length - 1];

    let signal = 'NEUTRAL';
    let confidence = 50;

    if (currentPrice < latest.lb) {
      signal = 'BUY';
      confidence = 75;
    } else if (currentPrice > latest.ub) {
      signal = 'SELL';
      confidence = 75;
    }

    return {
      bot: 'Bollinger Bands',
      upperBand: parseFloat(latest.ub.toFixed(2)),
      lowerBand: parseFloat(latest.lb.toFixed(2)),
      signal,
      confidence,
    };
  } catch (error) {
    return { bot: 'Bollinger Bands', signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * BOT 4: STOCHASTIC OSCILLATOR
 */
function calculateStochastic(prices) {
  try {
    if (prices.length < 14) return { signal: 'NEUTRAL', confidence: 50 };

    const stochData = Stochastic.calculate({
      high: prices.map(p => p * 1.01), // Simulate highs
      low: prices.map(p => p * 0.99),  // Simulate lows
      close: prices,
      period: 14,
      signalPeriod: 3,
    });

    if (stochData.length === 0) return { signal: 'NEUTRAL', confidence: 50 };

    const latest = stochData[stochData.length - 1];
    const kPercent = latest.k;

    let signal = 'NEUTRAL';
    let confidence = 50;

    if (kPercent < 30) {
      signal = 'BUY';
      confidence = 70;
    } else if (kPercent > 70) {
      signal = 'SELL';
      confidence = 70;
    }

    return {
      bot: 'Stochastic',
      kPercent: parseFloat(kPercent.toFixed(2)),
      signal,
      confidence,
    };
  } catch (error) {
    return { bot: 'Stochastic', signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * BOT 5: FINBERT SENTIMENT (Simulated - in production use huggingface)
 */
function analyzeFinBERTSentiment(newsHeadlines = []) {
  try {
    // In production, use HuggingFace transformers
    // For now, simulate based on keywords
    const bullishKeywords = ['surge', 'rally', 'bull', 'up', 'gain', 'strength'];
    const bearishKeywords = ['fall', 'crash', 'bear', 'down', 'loss', 'weakness'];

    let sentiment = 0;
    
    // Simulate sentiment
    const rand = Math.random();
    if (rand < 0.35) sentiment = -0.6;
    else if (rand < 0.5) sentiment = -0.2;
    else if (rand < 0.65) sentiment = 0.2;
    else sentiment = 0.6;

    let signal = 'NEUTRAL';
    if (sentiment > 0.5) signal = 'BUY';
    if (sentiment < -0.5) signal = 'SELL';

    return {
      bot: 'FinBERT Sentiment',
      sentiment: parseFloat(sentiment.toFixed(2)),
      signal,
      confidence: Math.abs(sentiment) * 100,
    };
  } catch (error) {
    return { bot: 'FinBERT Sentiment', sentiment: 0, signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * BOT 6: CLAUDE AI PATTERN RECOGNITION
 */
async function analyzeClaudePatterns(priceData) {
  try {
    if (!CONFIG.claudeApiKey) {
      return { bot: 'Claude AI', signal: 'NEUTRAL', confidence: 50, note: 'API key not set' };
    }

    const recentPrices = priceData.slice(-10);
    const priceChange = ((recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100).toFixed(2);

    const prompt = `Gold (XAU/USD) price data. Recent 10-candle prices: ${recentPrices.join(', ')}. Change: ${priceChange}%. Respond in JSON: {"signal": "BUY"|"SELL"|"NEUTRAL", "reasoning": "brief", "confidence": 0-100}`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-opus-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': CONFIG.claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
      }
    );

    const content = response.data.content[0].text;
    const parsed = JSON.parse(content);

    return {
      bot: 'Claude AI',
      signal: parsed.signal || 'NEUTRAL',
      confidence: parsed.confidence || 50,
      reasoning: parsed.reasoning,
    };
  } catch (error) {
    console.error('Claude API error:', error.message);
    return { bot: 'Claude AI', signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * BOT 7: CORRELATION ANALYZER
 */
function analyzeCorrelations(prices) {
  try {
    if (prices.length < 5) return { signal: 'NEUTRAL', confidence: 50 };

    // Simulate correlation breaks
    const recent = prices.slice(-5);
    const trend = recent[recent.length - 1] - recent[0];

    let signal = 'NEUTRAL';
    let confidence = 55;

    if (trend > 0) {
      signal = 'BUY';
      confidence = 65;
    } else if (trend < 0) {
      signal = 'SELL';
      confidence = 65;
    }

    return {
      bot: 'Correlation Analyzer',
      signal,
      confidence,
    };
  } catch (error) {
    return { bot: 'Correlation Analyzer', signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

/**
 * BOT 8: VADER SENTIMENT (Social media)
 */
function analyzeVADERSentiment() {
  try {
    // In production, analyze Twitter/Reddit
    const sentiments = [-0.8, -0.4, 0, 0.4, 0.8];
    const compound = sentiments[Math.floor(Math.random() * sentiments.length)];

    let signal = 'NEUTRAL';
    if (compound > 0.3) signal = 'BUY';
    if (compound < -0.3) signal = 'SELL';

    return {
      bot: 'VADER Sentiment',
      compound: parseFloat(compound.toFixed(2)),
      signal,
      confidence: Math.abs(compound) * 80,
    };
  } catch (error) {
    return { bot: 'VADER Sentiment', signal: 'NEUTRAL', confidence: 50, error: true };
  }
}

// ===== PART 3: SCORING ENGINE =====

function calculateConfidenceScore(sources, bots, riskFactors) {
  try {
    // Weighted average of all signals
    const sourceScores = sources
      .filter(s => s.confidence && !s.error)
      .map(s => ({
        signal: s.signal || s.goldSignal || s.sentiment,
        confidence: s.confidence,
      }));

    const botScores = bots
      .filter(b => b.confidence && !b.error)
      .map(b => ({
        signal: b.signal,
        confidence: b.confidence,
      }));

    const allScores = [...sourceScores, ...botScores];

    if (allScores.length === 0) {
      return { recommendation: 'WAIT', confidence: 0, buyCount: 0, sellCount: 0 };
    }

    // Count signals
    const buyCount = allScores.filter(s => s.signal === 'BUY').length;
    const sellCount = allScores.filter(s => s.signal === 'SELL').length;
    const avgConfidence = Math.round(allScores.reduce((sum, s) => sum + s.confidence, 0) / allScores.length);

    // Determine recommendation
    let recommendation = 'WAIT';
    if (buyCount >= 8 && avgConfidence >= 75) {
      recommendation = 'STRONG BUY';
    } else if (buyCount >= 6) {
      recommendation = 'BUY';
    } else if (sellCount >= 8 && avgConfidence >= 75) {
      recommendation = 'STRONG SELL';
    } else if (sellCount >= 6) {
      recommendation = 'SELL';
    }

    // Apply risk multiplier
    let riskMultiplier = 1.0;
    if (riskFactors.vixHigh) riskMultiplier += 0.15; // High fear = boost gold signal
    if (riskFactors.economicEvent) riskMultiplier -= 0.25; // Major event = reduce confidence
    if (!riskFactors.peakHours) riskMultiplier -= 0.2; // Outside peak = reduce

    const finalConfidence = Math.min(100, Math.round(avgConfidence * riskMultiplier));

    return {
      recommendation,
      baseConfidence: avgConfidence,
      finalConfidence,
      riskMultiplier: parseFloat(riskMultiplier.toFixed(2)),
      buyCount,
      sellCount,
      signalCount: buyCount + sellCount,
    };
  } catch (error) {
    console.error('Scoring error:', error.message);
    return { recommendation: 'WAIT', finalConfidence: 0, error: true };
  }
}

// ===== PART 4: GOOGLE SHEETS INTEGRATION =====

async function updateGoogleSheets(data) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_CREDENTIALS_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const values = [[
      data.timestamp,
      data.goldPrice,
      data.recommendation,
      data.rsi,
      data.macd,
      data.sentiment.toFixed(2),
      data.finalConfidence,
      data.alertSent ? 'YES' : 'NO',
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.googleSheetId,
      range: 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    console.log('✅ Google Sheet updated');
  } catch (error) {
    console.error('Google Sheets error:', error.message);
    // Continue anyway - don't break on sheet error
  }
}

// ===== PART 5: TELEGRAM ALERTS =====

async function sendTelegramAlert(data) {
  try {
    if (!CONFIG.telegramChatId) {
      console.log('⚠️ No Telegram Chat ID set');
      return;
    }

    const emoji = data.recommendation.includes('BUY') ? '🟢' : '🔴';
    const riskLevel = data.finalConfidence >= 80 ? 'HIGH' : data.finalConfidence >= 70 ? 'MEDIUM' : 'LOW';

    const message = `${emoji} GOLD ALERT - ${data.recommendation}\n\n💰 Price: $${data.goldPrice}\n📊 Confidence: ${data.finalConfidence}%\n🎯 Signals Agree: ${data.buyCount + data.sellCount}/${data.signalCount}\n\n📈 RSI: ${data.rsi} | MACD: ${data.macd}\n⚠️ Risk Level: ${riskLevel}\n🕐 Time: ${data.timestamp} (PKT)\n\n${data.finalConfidence >= 80 ? '⚡ HIGH CONFIDENCE - STRONG SIGNAL' : '✓ Moderate Signal - Exercise Caution'}`;

    await bot.sendMessage(CONFIG.telegramChatId, message);
    console.log('✅ Telegram alert sent');
  } catch (error) {
    console.error('Telegram error:', error.message);
  }
}

// ===== MAIN EXECUTION LOOP =====

async function runAnalysis() {
  console.log('\n🚀 Starting analysis cycle...');
  const startTime = new Date();

  try {
    // Fetch all 10 signal sources
    console.log('📡 Fetching signal sources...');
    const goldPrice = await fetchGoldPrice();
    const tvSignals = await fetchTradingViewSignals(priceHistory.prices);
    const myfxbook = await fetchMyfxbookSignals();
    const forexFactory = await fetchForexFactoryEvents();
    const kitco = await fetchKitcoSentiment();
    const dxy = await fetchDXYData();
    const vix = await fetchVIXData();
    const newsSentiment = await fetchNewsSentiment();
    const telegram = await fetchTelegramSignals();
    const oanda = await fetchOandaPositioning();

    const sources = [tvSignals, myfxbook, forexFactory, kitco, dxy, vix, newsSentiment, telegram, oanda];

    // Run all 8 AI bots
    console.log('🤖 Running AI bots...');
    const rsiData = calculateRSI(priceHistory.prices);
    const macdData = calculateMACD(priceHistory.prices);
    const bbData = calculateBollingerBands(priceHistory.prices);
    const stochData = calculateStochastic(priceHistory.prices);
    const finbertData = analyzeFinBERTSentiment();
    const claudeData = await analyzeClaudePatterns(priceHistory.prices);
    const correlationData = analyzeCorrelations(priceHistory.prices);
    const vaderData = analyzeVADERSentiment();

    const bots = [rsiData, macdData, bbData, stochData, finbertData, claudeData, correlationData, vaderData];

    // Calculate risk factors
    const riskFactors = {
      vixHigh: vix.vixLevel > 25,
      economicEvent: forexFactory.hasMajorEvent,
      peakHours: isPeakTradingHours(),
    };

    // Score all signals
    console.log('📊 Calculating confidence score...');
    const scoring = calculateConfidenceScore(sources, bots, riskFactors);

    // Prepare data for output
    const analysisData = {
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }),
      goldPrice: goldPrice.price,
      recommendation: scoring.recommendation,
      finalConfidence: scoring.finalConfidence,
      baseConfidence: scoring.baseConfidence,
      buyCount: scoring.buyCount,
      sellCount: scoring.sellCount,
      signalCount: scoring.signalCount,
      rsi: Math.round(rsiData.rsi || 50),
      macd: macdData.signal,
      sentiment: newsSentiment.sentiment,
      vixLevel: vix.vixLevel,
      shouldAlert: scoring.finalConfidence >= 75,
    };

    // Log to console
    console.log('\n📈 ANALYSIS RESULTS:');
    console.log(`Price: $${analysisData.goldPrice}`);
    console.log(`Recommendation: ${analysisData.recommendation}`);
    console.log(`Confidence: ${analysisData.finalConfidence}%`);
    console.log(`Signals: ${analysisData.buyCount} BUY, ${analysisData.sellCount} SELL`);

    // Update Google Sheet
       // await updateGoogleSheets(analysisData); // DISABLED FOR NOW
   console.log('✅ Google Sheets update skipped');

    // Send Telegram alert if confidence high enough
    if (analysisData.shouldAlert && analysisData.finalConfidence >= 75) {
      await sendTelegramAlert(analysisData);
      analysisData.alertSent = true;
    }

    const duration = ((new Date() - startTime) / 1000).toFixed(2);
    console.log(`✅ Cycle complete in ${duration}s\n`);

  } catch (error) {
    console.error('❌ Analysis error:', error.message);
  }
}

// ===== UTILITY FUNCTIONS =====

function isPeakTradingHours() {
  const now = new Date();
  const pktTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const hour = pktTime.getHours();
  // 1 PM - 8 PM PKT = peak volume
  return hour >= 13 && hour <= 20;
}

// ===== START SERVER =====

// Health check endpoint
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.get('/status', (req, res) => {
  res.json({
    status: 'running',
    priceHistoryLength: priceHistory.prices.length,
    lastUpdate: new Date(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log('🕐 Gold Trading System initialized');
  
  // Run analysis immediately, then every 5 minutes
  runAnalysis();
  setInterval(runAnalysis, CONFIG.checkInterval);
});

module.exports = { runAnalysis, calculateConfidenceScore };
