-- Migration 007: Add trigger to automatically delete SuperMemory documents
-- This trigger will fire whenever a document_supermemory_mapping record is deleted
-- (either directly or through cascade delete) and automatically call SuperMemory API

-- Enable the http extension for making API calls
CREATE EXTENSION IF NOT EXISTS http;

-- Create function to delete memory from SuperMemory
CREATE OR REPLACE FUNCTION delete_supermemory_document()
RETURNS trigger AS $$
DECLARE
  api_key text;
  api_url text;
  response http_response;
BEGIN
  -- Get the SuperMemory API key from Supabase secrets
  SELECT decrypted_secret INTO api_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'SUPERMEMORY_API_KEY';
  
  -- If no API key found, log warning but don't fail the delete operation
  IF api_key IS NULL THEN
    RAISE WARNING 'SuperMemory API key not found in vault secrets. Skipping SuperMemory cleanup for document ID: %', OLD.supermemory_id;
    RETURN OLD;
  END IF;
  
  -- Construct the API URL
  api_url := 'https://api.supermemory.ai/v3/memories/' || OLD.supermemory_id;
  
  -- Make DELETE request to SuperMemory API
  SELECT * INTO response FROM http((
    'DELETE',
    api_url,
    ARRAY[
      http_header('Authorization', 'Bearer ' || api_key),
      http_header('Content-Type', 'application/json')
    ],
    NULL,
    NULL
  )::http_request);
  
  -- Log the result
  IF response.status BETWEEN 200 AND 299 THEN
    RAISE NOTICE 'Successfully deleted SuperMemory document: % (Status: %)', OLD.supermemory_id, response.status;
  ELSE
    RAISE WARNING 'Failed to delete SuperMemory document: % (Status: %, Response: %)', OLD.supermemory_id, response.status, response.content;
  END IF;
  
  -- Always return OLD to allow the delete to proceed
  RETURN OLD;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't prevent the delete operation
    RAISE WARNING 'Error calling SuperMemory API for document %: %', OLD.supermemory_id, SQLERRM;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires AFTER DELETE on document_supermemory_mapping
CREATE OR REPLACE TRIGGER trigger_delete_supermemory_document
  AFTER DELETE ON document_supermemory_mapping
  FOR EACH ROW
  EXECUTE FUNCTION delete_supermemory_document();

-- Add some helpful comments
COMMENT ON FUNCTION delete_supermemory_document() IS 'Automatically calls SuperMemory API to delete documents when mapping records are removed';
COMMENT ON TRIGGER trigger_delete_supermemory_document ON document_supermemory_mapping IS 'Triggers SuperMemory API cleanup when mapping records are deleted (including cascade deletes)'; 