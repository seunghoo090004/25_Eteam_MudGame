-- scripts/create_local_db.sql
-- Creates a local DB and user for development

CREATE DATABASE IF NOT EXISTS gpt_chat_logs CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS 'gptuser'@'localhost' IDENTIFIED BY '1234';
GRANT ALL PRIVILEGES ON gpt_chat_logs.* TO 'gptuser'@'localhost';
FLUSH PRIVILEGES;
