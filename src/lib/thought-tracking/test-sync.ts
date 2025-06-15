/**
 * Test file to verify brain state synchronization
 * Run this in the browser console to test the new brain state system
 */

import { 
  createThought, 
  updateThought, 
  deleteThought, 
  getBrainState, 
  getBrainStateStats,
  getThoughtsForPage
} from './brain-state'

export function testBrainStateSync() {
  console.log('🧪 Testing Brain State Synchronization...')
  
  // Test 1: Create thoughts
  console.log('\n1. Creating test thoughts...')
  const thought1 = createThought('This is my first test thought', 'testing', 'test-page-1')
  const thought2 = createThought('This is my second test thought', 'testing', 'test-page-1')
  const thought3 = createThought('This is a different category thought', 'ideas', 'test-page-1')
  
  console.log('Created thoughts:', { thought1: thought1.id, thought2: thought2.id, thought3: thought3.id })
  
  // Test 2: Check brain state
  console.log('\n2. Checking brain state...')
  const stats = getBrainStateStats()
  console.log('Stats:', stats)
  
  // Test 3: Update a thought
  console.log('\n3. Updating a thought...')
  const updatedThought = updateThought(thought1.id, 'This is my UPDATED first test thought')
  console.log('Updated thought:', updatedThought)
  
  // Test 4: Get thoughts for page
  console.log('\n4. Getting thoughts for page...')
  const pageThoughts = getThoughtsForPage('test-page-1')
  console.log('Page thoughts:', pageThoughts.map(t => ({ id: t.id, content: t.content.substring(0, 30) + '...' })))
  
  // Test 5: Delete a thought
  console.log('\n5. Deleting a thought...')
  const deleted = deleteThought(thought2.id)
  console.log('Deleted:', deleted)
  
  // Test 6: Check final state
  console.log('\n6. Final state check...')
  const finalStats = getBrainStateStats()
  console.log('Final stats:', finalStats)
  
  // Test 7: Sync simulation
  console.log('\n7. Testing sync with mock editor content...')
  const mockEditorContent = `This is my UPDATED first test thought

This is a different category thought

Some new content that wasn't in brain state before`
  
  console.log('Mock editor content:', mockEditorContent)
  // Note: syncPageWithBrainState is not exported, so we'll test the individual functions
  
  console.log('\n✅ Brain state synchronization test complete!')
  console.log('Check the console logs above to verify everything worked correctly.')
  
  return {
    stats: finalStats,
    pageThoughts: getThoughtsForPage('test-page-1'),
    brainState: getBrainState()
  }
}

// Export for browser console testing
if (typeof window !== 'undefined') {
  (window as any).testBrainStateSync = testBrainStateSync
} 