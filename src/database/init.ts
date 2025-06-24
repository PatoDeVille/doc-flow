import { getDatabase } from "../config";

export const initializeDatabase = async () => {
  const db = getDatabase();

  try {
    console.log("🔧 Checking database schema...");

    // Check if documents table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'documents'
      );
    `);

    const tableExists = tableCheck.rows[0].exists;

    if (tableExists) {
      console.log("✅ Database schema already exists");
      return;
    }

    console.log("🏗️ Creating database schema...");

    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');


    await db.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        
        status VARCHAR(20) NOT NULL DEFAULT 'uploaded',
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        processed_at TIMESTAMP WITH TIME ZONE,
        

        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        processing_time_ms INTEGER,
        

        ocr_result JSONB,
        extracted_metadata JSONB,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for efficient querying
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)"
    );
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at)"
    );
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_documents_storage_key ON documents(storage_key)"
    );

    console.log("✅ Database schema created successfully");
  } catch (error) {
    console.error("❌ Failed to initialize database schema:", error);
    throw error;
  }
};
