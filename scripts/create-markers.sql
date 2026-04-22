-- Create markers table
CREATE TABLE IF NOT EXISTS markers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  lng VARCHAR(20),
  lat VARCHAR(20),
  address VARCHAR(500),
  description TEXT,
  type VARCHAR(32) DEFAULT 'other',
  status TINYINT DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO markers (name, lng, lat, address, type, status) VALUES
('天安门广场', '116.397128', '39.916527', '北京市东城区东长安街', 'spot', 1),
('故宫博物院', '116.397058', '39.916520', '北京市东城区景山前街4号', 'spot', 1),
('长城-八达岭', '116.017000', '40.431507', '北京市延庆区G6京藏高速58号出口', 'spot', 1),
('颐和园', '116.096148', '39.999594', '北京市海淀区新建宫门路19号', 'spot', 1),
('西湖', '120.129722', '30.246595', '浙江省杭州市西湖区龙井路1号', 'spot', 1),
('鼓浪屿', '118.063872', '24.447842', '福建省厦门市思明区鼓浪屿', 'spot', 1),
('张家界国家森林公园', '110.479211', '29.117013', '湖南省张家界市武陵源区', 'spot', 1),
('九寨沟', '103.917343', '32.953197', '四川省阿坝藏族羌族自治州九寨沟县', 'spot', 1),
('桂林山水', '110.179033', '25.274428', '广西桂林市象山区滨江路', 'spot', 1),
('丽江古城', '100.233026', '26.872107', '云南省丽江市古城区', 'spot', 1);
