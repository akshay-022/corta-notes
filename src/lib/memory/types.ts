
export interface MemoryDocument {
id: string
content: string
title: string
score?: number
metadata?: any
}

export interface MemorySearchResult {
results: MemoryDocument[]
query: string
}

export interface MemoryAddResponse {
success: boolean
memoryId?: string
error?: string
}

export interface MemoryProvider {
add(content: string, title: string, userId: string, metadata?: any): Promise<MemoryAddResponse>
search(query: string, userId: string, limit?: number): Promise<MemoryDocument[]>
update(memoryId: string, content: string, title: string): Promise<boolean>
delete(memoryId: string): Promise<boolean>
isConfigured(): boolean
}