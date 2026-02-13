# comic-server

自分のコミックコレクションをブラウザで管理・閲覧できるサーバーです。

画像フォルダを指定するだけで、本棚のように分類・レビューしながら読むことができます。

## 使い方 (Docker)

1. 以下の内容で `docker-compose.yml` を作成:

```yaml
services:
  comic-server:
    image: ghcr.io/miyabisun/comic-server:latest
    ports:
      - "3000:3000"
    volumes:
      - /path/to/comics:/comics    # ← コミック画像フォルダのパスに置き換え
    environment:
      - COMIC_PATH=/comics
      - PORT=3000
```

2. 起動:

```bash
docker compose up -d
```

3. ブラウザで `http://localhost:3000` を開く。

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
