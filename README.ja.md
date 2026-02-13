# comic-server

自分のコミックコレクションをブラウザで管理・閲覧できるサーバーです。

画像フォルダを指定するだけで、本棚のように分類・レビューしながら読むことができます。

## 使い方 (Docker + Nginx)

推奨構成: Nginx が画像を直接配信し、comic-server が API と SPA を処理します。

1. `docker-compose.yml` を作成:

```yaml
services:
  comic-server:
    image: ghcr.io/miyabisun/comic-server:latest
    environment:
      - COMIC_PATH=/comics
      - PORT=3000
      - BASE_PATH=/comic
    volumes:
      - /path/to/comics:/comics       # ← コミック画像フォルダのパスに置き換え
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /path/to/comics:/var/www/images:ro   # ← 上と同じパス
    depends_on:
      - comic-server
    restart: unless-stopped
```

2. `nginx.conf` を作成:

```nginx
events {
    worker_connections 1024;
}

http {
    include       mime.types;
    sendfile      on;

    upstream comic {
        server comic-server:3000;
    }

    server {
        listen 80;

        # 画像ファイルを Nginx で直接配信 (Node.js をバイパス)
        location /comic/images/ {
            alias /var/www/images/;
            expires 1d;
            add_header Cache-Control "public, immutable";
        }

        # アプリケーション (API + SPA)
        location = /comic {
            return 301 /comic/;
        }
        location /comic/ {
            proxy_pass http://comic/comic/;
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

3. 起動:

```bash
docker compose up -d
```

4. ブラウザで `http://localhost/comic/` を開く。

> Nginx なしのシンプルな構成については [リバースプロキシ設定](docs/reverse-proxy.md#standalone-without-nginx) を参照。

## 設定

| 環境変数 | デフォルト | 説明 |
|---|---|---|
| `COMIC_PATH` | `./comics` | コミック画像フォルダのパス |
| `PORT` | `3000` | サーバーのポート番号 |
| `BASE_PATH` | (なし) | リバースプロキシ配下で使う場合のパス (例: `/comic`)。ランタイム設定のみで再ビルド不要。 |

データベース (`comic.db`) は初回起動時に `COMIC_PATH` 内に自動生成されます。本棚ディレクトリも自動で作成されます。

## フォルダ構成

`COMIC_PATH` に指定したフォルダの中に、本棚ごとのサブフォルダを配置します。
各コミックは PNG/JPEG 画像を含むフォルダです。

```
COMIC_PATH/
├── haystack/    # 取り込み待ち (ここに置くと登録できる)
├── unread/      # 未読
├── trash/       # いまいち
├── hold/        # 保留
├── like/        # 良い
├── favorite/    # お気に入り
├── legend/      # 殿堂入り
└── deleted/     # 削除済み
```

## 詳細ドキュメント

- [開発ガイド](docs/development.md) — ローカルでの開発・ビルド方法
- [リバースプロキシ設定](docs/reverse-proxy.md) — Nginx 等でサブパス配下にデプロイする方法
- [API リファレンス](docs/api.md) — REST API の仕様
