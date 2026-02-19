/**
 * Simulates real user interaction: multi-turn tool loop with Groq.
 * Uses the same payload as when a user says: "Please pentest this website http://testphp.vulnweb.com/"
 * Sends request → gets tool_calls → mocks tool results → sends back → repeats.
 * Logs REQUEST and RESPONSE for every round (debugging mode).
 *
 * Usage:
 *   npm run test:groq-request-response
 *
 * Requires .env with GROQ_API_KEY.
 * Optional: DEFAULT_AUTO_MODEL, MAX_OUTPUT_TOKENS_TOOLS or MAX_OUTPUT_TOKENS_DEFAULT.
 * Optional: GROQ_TEST_MAX_TURNS=2 to limit turns (default 10).
 */

import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../../.env') });

import { PENTEST_SYSTEM_PROMPT } from '../prompt/pentest.system-prompt';
import { PENTEST_TOOL_DEFS } from '../prompt/pentest-tools.def';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const apiKey = process.env.GROQ_API_KEY?.trim();
const model = process.env.DEFAULT_AUTO_MODEL || 'llama-3.1-8b-instant';
const maxTokensRaw =
  process.env.MAX_OUTPUT_TOKENS_TOOLS ?? process.env.MAX_OUTPUT_TOKENS_DEFAULT ?? '300';
const maxTokens = parseInt(maxTokensRaw, 10) || 300;
const MAX_TURNS = parseInt(process.env.GROQ_TEST_MAX_TURNS || '10', 10) || 10;

if (!apiKey) {
  console.error('GROQ_API_KEY is not set in .env');
  process.exit(1);
}

type OpenAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

const userMessage = 'Please pentest this website http://testphp.vulnweb.com/';
const apiTools = PENTEST_TOOL_DEFS.map((t) => ({
  type: 'function' as const,
  function: {
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  },
}));

/** Mock tool execution (like real backend would return). */
function mockToolExecution(name: string, args: Record<string, unknown>): string {
  const argsStr = JSON.stringify(args);
  switch (name) {
    case 'memory_search':
      return `[mock] No prior notes for query: ${args.query ?? argsStr}`;
    case 'memory_get':
      return `[mock] Content at path "${args.path ?? 'main'}": (empty or placeholder)\n`;
    case 'write_file':
      return '[mock] Written.';
    case 'exec':
      return `[mock] Command executed.\nHTTP/1.1 200 OK\nServer: nginx`;
    case 'craft_payload':
      return '[mock] Payload run completed.';
    case 'report_finding':
      return '[mock] Finding recorded.';
    case 'update_pentest_phase':
      return '[mock] Phase updated.';
    case 'add_skill':
    case 'download_skill':
    case 'download_agent':
    case 'git_search':
    case 'agents_list':
    case 'sessions_list':
    case 'sessions_history':
    case 'sessions_send':
    case 'sessions_spawn':
    case 'session_status':
      return '[mock] OK';
    default:
      return `[mock] ${name}(${argsStr}) done.`;
  }
}

function logSection(title: string, obj: unknown) {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
  if (typeof obj === 'string') {
    console.log(obj);
  } else {
    console.log(JSON.stringify(obj, null, 2));
  }
}

async function main() {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: PENTEST_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const toolChoice = turn === 1 ? 'required' : 'auto';
    const payload = {
      model,
      messages,
      tools: apiTools,
      tool_choice: toolChoice,
      max_tokens: maxTokens,
    };

    logSection(`REQUEST TO GROQ (turn ${turn})`, {
      url: GROQ_URL,
      method: 'POST',
      max_tokens: maxTokens,
      tool_choice: toolChoice,
      messages_count: messages.length,
      body: payload,
    });

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const bodyText = await res.text();
    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = bodyText;
    }

    logSection(`RESPONSE FROM GROQ (turn ${turn})`, {
      status: res.status,
      statusText: res.statusText,
      body: data,
    });

    if (res.status !== 200) {
      console.error('\nNon-200 response. Stopping.');
      break;
    }

    const err = data?.error;
    if (err) {
      console.error('\nError in response body. Stopping.');
      break;
    }

    const choice = data?.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      console.error('\nNo choices[0].message. Stopping.');
      break;
    }

    const assistantMsg: OpenAIMessage = {
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: msg.tool_calls,
    };
    messages.push(assistantMsg);

    const finishReason = choice?.finish_reason;
    const toolCalls = msg.tool_calls ?? [];

    if (finishReason === 'stop' || toolCalls.length === 0) {
      console.log('\n--- Done (no more tool_calls or finish_reason=stop). ---');
      break;
    }

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : {};
      } catch {
        args = {};
      }
      const name = tc.function?.name ?? 'unknown';
      const result = mockToolExecution(name, args);
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
      console.log(`\n[mock tool] ${name}(${JSON.stringify(args)}) => ${result.slice(0, 80)}${result.length > 80 ? '...' : ''}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
