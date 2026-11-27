-- Skema Anna Brew. Aman dijalankan berulang: semua pakai IF NOT EXISTS.
-- Tabel yang sudah ada di database TIDAK diubah.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(60) NOT NULL DEFAULT 'Staff Gudang',
  location VARCHAR(100) NOT NULL DEFAULT 'Kantor Pusat',
  status VARCHAR(20) NOT NULL DEFAULT 'Aktif',
  otp_code VARCHAR(10) NULL,
  otp_expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(255) NULL,
  code VARCHAR(30) NULL,
  city VARCHAR(100) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Aktif',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  sku VARCHAR(50) NOT NULL UNIQUE,
  unit VARCHAR(20) NOT NULL DEFAULT 'kg',
  price DECIMAL(14,2) NOT NULL DEFAULT 0,
  image_url VARCHAR(500) NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'Green Bean',
  stock DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB;

-- status: pending, approved, shipping, partial, completed, damaged, cancelled
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(30) NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  created_by INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  ordered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expected_at DATE NULL,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  received_good INT NOT NULL DEFAULT 0,
  received_damaged INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_poi_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_id INT NOT NULL,
  user_id INT NULL,
  action VARCHAR(40) NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pol_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- status: submitted, reviewed, resolved, closed
CREATE TABLE IF NOT EXISTS discrepancies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  disc_number VARCHAR(30) NOT NULL UNIQUE,
  po_id INT NOT NULL,
  po_item_id INT NOT NULL,
  type VARCHAR(40) NOT NULL,
  qty_problem INT NOT NULL,
  qty_good INT NOT NULL DEFAULT 0,
  description VARCHAR(500) NULL,
  photo_name VARCHAR(200) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  reported_by INT NULL,
  loss DECIMAL(14,2) NULL,
  qty_label VARCHAR(100) NULL,
  reported_label VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_disc_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_disc_item FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Penanda data contoh sudah pernah diisi (supaya data yang kamu hapus tidak muncul lagi)
CREATE TABLE IF NOT EXISTS app_meta (
  meta_key VARCHAR(50) PRIMARY KEY,
  meta_value VARCHAR(255) NULL
) ENGINE=InnoDB;
