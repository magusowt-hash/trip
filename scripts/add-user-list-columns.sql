-- Add user list tracking columns to users table (MySQL syntax)
ALTER TABLE users ADD COLUMN favorite_lists JSON DEFAULT NULL;
ALTER TABLE users ADD COLUMN visited_places JSON DEFAULT NULL;
ALTER TABLE users ADD COLUMN ratings JSON DEFAULT NULL;

-- Verify columns
SELECT COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('favorite_lists', 'visited_places', 'ratings');