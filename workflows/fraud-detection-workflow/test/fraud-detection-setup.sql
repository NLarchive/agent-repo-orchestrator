-- Fraud Detection Data Setup
-- This script creates and populates tables for the fraud detection workflow

-- Create transactions table
CREATE TABLE IF NOT EXISTS orchestrator.transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  merchant_id INTEGER,
  merchant_category VARCHAR(100),
  transaction_type VARCHAR(50) DEFAULT 'purchase',
  card_number_hash VARCHAR(64),
  ip_address INET,
  user_agent TEXT,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  location_country VARCHAR(2),
  location_city VARCHAR(100),
  device_fingerprint VARCHAR(64),
  velocity_score DECIMAL(3,2) DEFAULT 0.0,
  risk_score DECIMAL(3,2) DEFAULT 0.0,
  processed_at TIMESTAMP,
  fraud_flag BOOLEAN DEFAULT FALSE,
  fraud_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create customer_profiles table
CREATE TABLE IF NOT EXISTS orchestrator.customer_profiles (
  customer_id INTEGER PRIMARY KEY,
  risk_score DECIMAL(3,2) DEFAULT 0.5,
  account_age_days INTEGER DEFAULT 0,
  transaction_history JSONB,
  geographic_patterns JSONB,
  device_history JSONB,
  velocity_patterns JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create merchants table
CREATE TABLE IF NOT EXISTS orchestrator.merchants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  risk_score DECIMAL(3,2) DEFAULT 0.1,
  location_country VARCHAR(2),
  location_city VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON orchestrator.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON orchestrator.transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_processed_at ON orchestrator.transactions(processed_at);
CREATE INDEX IF NOT EXISTS idx_transactions_fraud_flag ON orchestrator.transactions(fraud_flag);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_risk_score ON orchestrator.customer_profiles(risk_score);

-- Insert sample merchants
INSERT INTO orchestrator.merchants (name, category, risk_score, location_country, location_city) VALUES
  ('Amazon Online', 'e-commerce', 0.05, 'US', 'Seattle'),
  ('Starbucks Coffee', 'food', 0.02, 'US', 'Seattle'),
  ('Walmart Supercenter', 'retail', 0.03, 'US', 'Bentonville'),
  ('Uber Technologies', 'transportation', 0.08, 'US', 'San Francisco'),
  ('Netflix Subscription', 'entertainment', 0.01, 'US', 'Los Gatos'),
  ('ATM Withdrawal', 'financial', 0.15, 'US', 'Various'),
  ('Hotel Booking', 'travel', 0.06, 'US', 'Various'),
  ('Cryptocurrency Exchange', 'financial', 0.25, 'US', 'Various'),
  ('Luxury Goods Store', 'retail', 0.12, 'US', 'New York'),
  ('Online Gambling', 'entertainment', 0.35, 'US', 'Various')
ON CONFLICT DO NOTHING;

-- Insert sample customer profiles
INSERT INTO orchestrator.customer_profiles (customer_id, risk_score, account_age_days, transaction_history, geographic_patterns, device_history, velocity_patterns) VALUES
  (1001, 0.15, 365, '{"total_transactions": 245, "avg_amount": 85.50, "categories": {"e-commerce": 45, "food": 30, "retail": 25}}', '{"home_country": "US", "home_city": "New York", "frequent_cities": ["New York", "Boston"], "international_ratio": 0.05}', '{"primary_device": "iPhone", "device_count": 2, "browser_fingerprint": "abc123"}', '{"daily_avg": 2.1, "hourly_max": 5, "weekend_ratio": 0.8}'),
  (1002, 0.08, 180, '{"total_transactions": 89, "avg_amount": 45.20, "categories": {"food": 35, "transportation": 20, "entertainment": 15}}', '{"home_country": "US", "home_city": "San Francisco", "frequent_cities": ["San Francisco", "Oakland"], "international_ratio": 0.02}', '{"primary_device": "Android", "device_count": 1, "browser_fingerprint": "def456"}', '{"daily_avg": 1.5, "hourly_max": 3, "weekend_ratio": 0.9}'),
  (1003, 0.25, 90, '{"total_transactions": 34, "avg_amount": 125.75, "categories": {"retail": 20, "travel": 8, "financial": 6}}', '{"home_country": "US", "home_city": "Los Angeles", "frequent_cities": ["Los Angeles", "Las Vegas"], "international_ratio": 0.15}', '{"primary_device": "iPhone", "device_count": 3, "browser_fingerprint": "ghi789"}', '{"daily_avg": 3.2, "hourly_max": 8, "weekend_ratio": 0.6}'),
  (1004, 0.05, 720, '{"total_transactions": 1250, "avg_amount": 25.30, "categories": {"food": 400, "transportation": 350, "retail": 300}}', '{"home_country": "US", "home_city": "Chicago", "frequent_cities": ["Chicago", "Milwaukee"], "international_ratio": 0.01}', '{"primary_device": "Android", "device_count": 1, "browser_fingerprint": "jkl012"}', '{"daily_avg": 1.8, "hourly_max": 4, "weekend_ratio": 0.85}'),
  (1005, 0.35, 30, '{"total_transactions": 12, "avg_amount": 250.00, "categories": {"financial": 8, "entertainment": 4}}', '{"home_country": "US", "home_city": "Miami", "frequent_cities": ["Miami", "Las Vegas"], "international_ratio": 0.30}', '{"primary_device": "iPhone", "device_count": 4, "browser_fingerprint": "mno345"}', '{"daily_avg": 4.5, "hourly_max": 12, "weekend_ratio": 0.4}')
ON CONFLICT (customer_id) DO NOTHING;

-- Insert synthetic transaction data (last 24 hours)
-- Mix of legitimate and fraudulent transactions
INSERT INTO orchestrator.transactions (customer_id, amount, merchant_id, merchant_category, transaction_type, ip_address, location_lat, location_lng, location_country, location_city, device_fingerprint, created_at) VALUES
  -- Customer 1001 (medium risk) - legitimate transactions
  (1001, 45.67, 1, 'e-commerce', 'purchase', '192.168.1.100', 40.7128, -74.0060, 'US', 'New York', 'abc123-iphone', NOW() - INTERVAL '2 hours'),
  (1001, 12.50, 2, 'food', 'purchase', '192.168.1.100', 40.7589, -73.9851, 'US', 'New York', 'abc123-iphone', NOW() - INTERVAL '4 hours'),
  (1001, 89.99, 1, 'e-commerce', 'purchase', '192.168.1.100', 40.7128, -74.0060, 'US', 'New York', 'abc123-iphone', NOW() - INTERVAL '6 hours'),

  -- Customer 1002 (low risk) - legitimate transactions
  (1002, 8.75, 2, 'food', 'purchase', '10.0.0.50', 37.7749, -122.4194, 'US', 'San Francisco', 'def456-android', NOW() - INTERVAL '1 hour'),
  (1002, 25.00, 4, 'transportation', 'purchase', '10.0.0.50', 37.7849, -122.4094, 'US', 'San Francisco', 'def456-android', NOW() - INTERVAL '3 hours'),

  -- Customer 1003 (high risk) - suspicious pattern
  (1003, 500.00, 8, 'financial', 'purchase', '203.0.113.10', 34.0522, -118.2437, 'US', 'Los Angeles', 'ghi789-iphone', NOW() - INTERVAL '30 minutes'),
  (1003, 750.00, 9, 'retail', 'purchase', '203.0.113.15', 36.1699, -115.1398, 'US', 'Las Vegas', 'ghi789-ipad', NOW() - INTERVAL '45 minutes'),
  (1003, 1200.00, 10, 'entertainment', 'purchase', '203.0.113.20', 36.1146, -115.1728, 'US', 'Las Vegas', 'ghi789-ipad', NOW() - INTERVAL '1 hour'),

  -- Customer 1004 (low risk) - legitimate transactions
  (1004, 5.25, 2, 'food', 'purchase', '172.16.0.25', 41.8781, -87.6298, 'US', 'Chicago', 'jkl012-android', NOW() - INTERVAL '90 minutes'),
  (1004, 15.99, 4, 'transportation', 'purchase', '172.16.0.25', 41.8781, -87.6298, 'US', 'Chicago', 'jkl012-android', NOW() - INTERVAL '5 hours'),

  -- Customer 1005 (very high risk) - fraudulent pattern
  (1005, 2500.00, 8, 'financial', 'purchase', '185.156.73.50', 25.7617, -80.1918, 'US', 'Miami', 'mno345-iphone', NOW() - INTERVAL '15 minutes'),
  (1005, 1800.00, 10, 'entertainment', 'purchase', '185.156.73.55', 36.1146, -115.1728, 'US', 'Las Vegas', 'mno345-ipad', NOW() - INTERVAL '20 minutes'),
  (1005, 3200.00, 8, 'financial', 'purchase', '185.156.73.60', 25.7617, -80.1918, 'US', 'Miami', 'mno345-iphone', NOW() - INTERVAL '25 minutes'),

  -- Additional legitimate transactions for variety
  (1001, 67.89, 3, 'retail', 'purchase', '192.168.1.100', 40.7128, -74.0060, 'US', 'New York', 'abc123-iphone', NOW() - INTERVAL '8 hours'),
  (1002, 120.00, 7, 'travel', 'purchase', '10.0.0.50', 37.7749, -122.4194, 'US', 'San Francisco', 'def456-android', NOW() - INTERVAL '7 hours'),
  (1004, 3.99, 2, 'food', 'purchase', '172.16.0.25', 41.8781, -87.6298, 'US', 'Chicago', 'jkl012-android', NOW() - INTERVAL '10 hours'),

  -- More suspicious transactions
  (1003, 850.00, 9, 'retail', 'purchase', '203.0.113.25', 34.0522, -118.2437, 'US', 'Los Angeles', 'ghi789-macbook', NOW() - INTERVAL '2 hours'),
  (1005, 950.00, 8, 'financial', 'purchase', '185.156.73.65', 25.7617, -80.1918, 'US', 'Miami', 'mno345-macbook', NOW() - INTERVAL '35 minutes')
ON CONFLICT DO NOTHING;

-- Insert some transactions that should be flagged as fraud (very recent, high amounts, unusual patterns)
INSERT INTO orchestrator.transactions (customer_id, amount, merchant_id, merchant_category, transaction_type, ip_address, location_lat, location_lng, location_country, location_city, device_fingerprint, created_at) VALUES
  -- Fraudulent transactions (should be flagged)
  (1005, 5000.00, 8, 'financial', 'purchase', '91.203.45.120', 55.7558, 37.6173, 'RU', 'Moscow', 'xyz999-unknown', NOW() - INTERVAL '2 minutes'),
  (1003, 3500.00, 10, 'entertainment', 'purchase', '203.0.113.30', 1.3521, 103.8198, 'SG', 'Singapore', 'ghi789-newdevice', NOW() - INTERVAL '3 minutes'),
  (1005, 2800.00, 8, 'financial', 'purchase', '185.156.73.70', -33.8688, 151.2093, 'AU', 'Sydney', 'mno345-newdevice', NOW() - INTERVAL '4 minutes'),
  (1003, 4200.00, 9, 'retail', 'purchase', '203.0.113.35', 51.5074, -0.1278, 'GB', 'London', 'ghi789-different', NOW() - INTERVAL '5 minutes')
ON CONFLICT DO NOTHING;

-- Nicolas Larenas, nlarchive
