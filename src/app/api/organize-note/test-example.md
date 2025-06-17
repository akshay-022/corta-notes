# Organize API Test Example

This demonstrates how the new simplified organize API works with the thought-tracking system.

## Input Format

```json
{
  "type": "organize_content",
  "request": {
    "edits": [
      {
        "id": "edit-1",
        "paragraphId": "para-1",
        "pageId": "page-1",
        "content": "Need to review the quarterly budget for Q4",
        "timestamp": 1703097600000,
        "editType": "create",
        "organized": false
      },
      {
        "id": "edit-2", 
        "paragraphId": "para-2",
        "pageId": "page-1",
        "content": "Meeting notes: discussed new project timeline",
        "timestamp": 1703097700000,
        "editType": "update",
        "organized": false
      },
      {
        "id": "edit-3",
        "paragraphId": "para-3", 
        "pageId": "page-2",
        "content": "Research idea: AI-powered note organization",
        "timestamp": 1703097800000,
        "editType": "create",
        "organized": false
      }
    ],
    "currentSummary": "Various work notes and ideas",
    "existingPages": [
      {
        "uuid": "page-budget-1",
        "title": "Q4 Budget Planning",
        "content": {"type": "doc", "content": []},
        "content_text": "Budget planning for Q4...",
        "organized": true,
        "type": "file",
        "parent_uuid": "folder-finance"
      },
      {
        "uuid": "folder-finance",
        "title": "Finance",
        "content": {"type": "doc", "content": []},
        "content_text": "",
        "organized": true,
        "type": "folder",
        "parent_uuid": null
      }
    ],
    "config": {
      "preserveAllInformation": true,
      "createNewPagesThreshold": 0.3,
      "maxSimilarityForMerge": 0.7,
      "contextWindowSize": 4000
    }
  }
}
```

## Expected AI Response (Internal)

The AI will analyze the edits and existing file tree to produce mappings like:

```json
[
  {
    "content": "Need to review the quarterly budget for Q4",
    "path": "/Finance/Q4 Budget Planning",
    "editId": "edit-1",
    "reasoning": "Budget-related content matches existing Q4 Budget Planning file"
  },
  {
    "content": "Meeting notes: discussed new project timeline", 
    "path": "/Projects/Meeting Notes",
    "editId": "edit-2",
    "reasoning": "Meeting content should go in dedicated meeting notes file"
  },
  {
    "content": "Research idea: AI-powered note organization",
    "path": "/Research/AI Ideas",
    "editId": "edit-3", 
    "reasoning": "Research idea should be organized with other AI research topics"
  }
]
```

## API Response

```json
{
  "updatedPages": [
    {
      "uuid": "page-budget-1",
      "title": "Q4 Budget Planning",
      "content": {"type": "doc", "content": [...]},
      "content_text": "Budget planning for Q4...\n\nNeed to review the quarterly budget for Q4",
      "organized": true,
      "type": "file"
    }
  ],
  "newPages": [
    {
      "uuid": "new-page-1",
      "title": "Meeting Notes", 
      "content": {"type": "doc", "content": [...]},
      "content_text": "Meeting notes: discussed new project timeline",
      "organized": true,
      "type": "file"
    },
    {
      "uuid": "new-page-2",
      "title": "AI Ideas",
      "content": {"type": "doc", "content": [...]}, 
      "content_text": "Research idea: AI-powered note organization",
      "organized": true,
      "type": "file"
    }
  ],
  "summary": "Successfully organized 3 edits into 3 pages",
  "processedEditIds": ["edit-1", "edit-2", "edit-3"]
}
```

## Key Features

1. **Individual Edit Processing**: Each edit is processed separately and mapped to the most appropriate file
2. **Intelligent Path Selection**: AI considers existing file structure and content similarity
3. **File Tree Awareness**: Uses organized pages to understand existing structure
4. **Content Preservation**: Original edit content is kept intact, just organized
5. **Batch Operations**: Multiple edits can be grouped into the same file when appropriate
6. **Automatic Folder Creation**: Creates folder structure as needed for new paths

## Simple Workflow

1. Thought-tracking system collects edits
2. When threshold reached (>2 edits with current test config), trigger organization
3. API maps each edit to appropriate file path using AI
4. Content is appended to existing files or new files are created
5. Edits are marked as organized in the brain state

This approach is much simpler than the previous cache-based system while still providing intelligent organization. 