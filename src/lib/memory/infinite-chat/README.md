# Supermemory Infinite Chat Integration

This module provides seamless integration with [supermemory's infinite chat](https://supermemory.ai/docs/model-enhancement/context-extender) for unlimited conversation context.

## Features

- **Transparent Proxy**: Routes through supermemory to OpenAI with zero latency overhead
- **Unlimited Context**: No more token limits - conversations can extend indefinitely
- **Cross-Conversation Memory**: Searches for relevant memories from ALL previous conversations
- **User Scoping**: Conversations are scoped per user via `x-supermemory-user-id` header
- **Automatic Fallback**: Falls back to regular OpenAI if supermemory is not configured
- **Diagnostic Logging**: Tracks supermemory performance metrics and diagnostics

## Usage

### Basic Setup

```typescript
import { createSupermemoryClient, isSupermemoryConfigured } from '@/lib/memory/infinite-chat';

// Check if supermemory is configured
if (isSupermemoryConfigured()) {
  // Create client with user ID for conversation scoping
  const openai = createSupermemoryClient(userId);
  
  // Use exactly like regular OpenAI client
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: conversationHistory,
    stream: true
  });
}
```

### Environment Variables

Required environment variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `SUPERMEMORY_API_KEY`: Your supermemory API key

### Integration in Chat Panel

The chat panel route (`src/app/api/chat-panel/route.ts`) automatically:
1. Checks if supermemory is configured
2. Gets the authenticated user ID
3. **Searches for relevant memories** from ALL previous conversations
4. **Injects cross-conversation context** into the current message
5. Creates the appropriate client (supermemory or fallback)
6. Sends the entire conversation history with enhanced context
7. Lets supermemory handle all the magic

## How It Works

1. **Cross-Conversation Search**: Before each request, search for relevant memories from ALL previous conversations
2. **Memory Injection**: Inject relevant cross-conversation context into the current message
3. **Transparent Proxying**: All requests pass through supermemory to OpenAI
4. **Intelligent Chunking**: Long conversations are automatically broken down into optimized segments
5. **Smart Retrieval**: When conversations exceed 20k tokens, supermemory intelligently retrieves the most relevant context
6. **Automatic Token Management**: Balances token usage for optimal performance and cost

## Benefits

- **70% cost savings** for long conversations
- **Unlimited context** - no more 8k/32k/128k token limits
- **Improved response quality** with better context retrieval
- **Zero performance penalty** - negligible latency overhead

## Diagnostic Headers

Supermemory returns diagnostic headers that can be extracted:
- `x-supermemory-conversation-id`: Unique conversation identifier
- `x-supermemory-context-modified`: Whether context was modified
- `x-supermemory-tokens-processed`: Number of tokens processed
- `x-supermemory-chunks-created`: Number of new chunks created
- `x-supermemory-chunks-deleted`: Number of chunks removed
- `x-supermemory-docs-deleted`: Number of documents removed

## Error Handling

If supermemory encounters any issues, it automatically falls back to direct forwarding to the underlying LLM provider, ensuring zero downtime. 