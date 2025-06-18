import { LineEdit } from '../types';

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(word => set2.has(word)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  const frequency: Record<string, number> = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  
  return Object.entries(frequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

export function groupLineEditsByTimeWindow(
  edits: LineEdit[], 
  windowMs: number = 5 * 60 * 1000 // 5 minutes default
): LineEdit[][] {
  if (edits.length === 0) return [];
  
  const sortedEdits = [...edits].sort((a, b) => a.timestamp - b.timestamp);
  const groups: LineEdit[][] = [];
  let currentGroup: LineEdit[] = [sortedEdits[0]];
  
  for (let i = 1; i < sortedEdits.length; i++) {
    const edit = sortedEdits[i];
    const lastEdit = currentGroup[currentGroup.length - 1];
    
    if (edit.timestamp - lastEdit.timestamp <= windowMs) {
      currentGroup.push(edit);
    } else {
      groups.push(currentGroup);
      currentGroup = [edit];
    }
  }
  
  groups.push(currentGroup);
  return groups;
}

export function sanitizeContent(content: string): string {
  return content
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

export function validateLineEdit(edit: Partial<LineEdit>): boolean {
  return !!(
    edit.lineId &&
    edit.pageId &&
    edit.content !== undefined && // Allow empty string for delete
    edit.editType &&
    ['create', 'update', 'delete'].includes(edit.editType)
  );
}

export function getLatestLineEdits(lineMap: Record<string, LineEdit[]>): LineEdit[] {
  // Get the latest version of each line
  const latestEdits: LineEdit[] = [];
  
  for (const lineEdits of Object.values(lineMap)) {
    if (lineEdits.length > 0) {
      const latestEdit = lineEdits[lineEdits.length - 1];
      latestEdits.push(latestEdit);
    }
  }
  
  return latestEdits.sort((a, b) => a.timestamp - b.timestamp);
}

export function estimateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const wordCount = text.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
} 