-- Run this file in MySQL: mysql -u root -p < db-setup.sql

CREATE DATABASE IF NOT EXISTS webperf_experiment;
USE webperf_experiment;

DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  sku VARCHAR(50),
  rating DECIMAL(3, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category_id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Insert 20 categories
INSERT INTO categories (name, slug, description) VALUES
('Electronics', 'electronics', 'Electronic devices and gadgets'),
('Clothing', 'clothing', 'Apparel and fashion'),
('Books', 'books', 'Physical and digital books'),
('Home & Garden', 'home-garden', 'Home improvement and garden supplies'),
('Sports', 'sports', 'Sporting goods and equipment'),
('Toys', 'toys', 'Toys and games for all ages'),
('Automotive', 'automotive', 'Car parts and accessories'),
('Beauty', 'beauty', 'Beauty and personal care'),
('Food', 'food', 'Groceries and gourmet foods'),
('Office', 'office', 'Office supplies and equipment'),
('Music', 'music', 'Instruments and audio equipment'),
('Pet Supplies', 'pet-supplies', 'Products for pets'),
('Travel', 'travel', 'Luggage and travel accessories'),
('Health', 'health', 'Health and wellness products'),
('Movies', 'movies', 'DVDs, Blu-rays and streaming'),
('Furniture', 'furniture', 'Home and office furniture'),
('Jewellery', 'jewellery', 'Rings, necklaces and watches'),
('Tools', 'tools', 'Power and hand tools'),
('Baby', 'baby', 'Baby care and products'),
('Software', 'software', 'Computer software and games');

-- A stored procedure to insert 10,000 product rows efficiently
DELIMITER $$
CREATE PROCEDURE seed_products()
BEGIN
  DECLARE i INT DEFAULT 1;
  WHILE i <= 10000 DO
    INSERT INTO products (category_id, name, description, price, stock, sku, rating)
    VALUES (
      (i MOD 20) + 1,
      CONCAT('Product ', i),
      CONCAT('Description for product number ', i, '. High quality item.'),
      ROUND(1 + (RAND() * 999), 2),
      FLOOR(RAND() * 500),
      CONCAT('SKU-', LPAD(i, 6, '0')),
      ROUND(1 + (RAND() * 4), 1)
    );
    SET i = i + 1;
  END WHILE;
END$$
DELIMITER ;

CALL seed_products();
DROP PROCEDURE IF EXISTS seed_products;

-- Index for complex query performance
CREATE INDEX idx_price ON products(price);
CREATE INDEX idx_rating ON products(rating);

SELECT CONCAT('Setup complete. Products: ', COUNT(*), ' rows.') AS status FROM products;
