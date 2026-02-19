# comic-server

自分のコミックコレクションをブラウザで管理・閲覧できるサーバーです。

画像フォルダを指定するだけで、本棚のように分類・レビューしながら読むことができます。

## Quick Start (Docker)

```bash
docker run -p 3000:3000 -v /path/to/comics:/comics ghcr.io/miyabisun/comic-server:latest
```

ブラウザで `http://localhost:3000` を開く。

## Quick Start (Bun)

```bash
bun install && bun run build:client
COMIC_PATH=/path/to/comics bun start
```

ブラウザで `http://localhost:3000` を開く。

> Nginx でサブパス配下にデプロイする場合は [リバースプロキシ設定](docs/reverse-proxy.md) を参照。

## 設定

| 環境変数 | デフォルト | 説明 |
|---|---|---|
| `COMIC_PATH` | `./comics` | コミック画像フォルダのパス |
| `DATABASE_PATH` | `COMIC_PATH/comic.db` | SQLite データベースファイルのパス |
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
├── hold/        # 保留
├── like/        # 良い
├── favorite/    # お気に入り
├── love/        # とても好き
├── legend/      # 殿堂入り
└── deleted/     # 削除済み
```

## 使い方の流れ

### 1. サーバーを起動する

初回起動時に `haystack/` を含むすべての本棚ディレクトリが自動作成されます。

### 2. `haystack/` にコミックを追加する

画像ファイル (`.jpg`, `.png`) を含むフォルダを `haystack/` ディレクトリに配置します。

フォルダ名は `(ジャンル) [ブランド] タイトル (原作)` の形式を想定しています:

```
haystack/
├── (同人誌) [サークル名] 作品タイトル (原作名)/
│   ├── 001.jpg
│   ├── 002.jpg
│   └── ...
├── (成年コミック) [作者名] コミックタイトル [DL版]/
│   └── ...
└── (同人CG集) [スタジオ名] CG集タイトル (シリーズ名)/
    └── ...
```

フォルダ名の各パートは自動的にパースされ、データベースに登録されます:

| パート | 例 | DB フィールド |
|--------|-----|---------------|
| `(ジャンル)` | `(同人誌)` | `genre` |
| `[ブランド]` | `[サークル名]` | `brand` |
| タイトル | `作品タイトル` | `title` |
| `(原作)` | `(原作名)` | `original` |

### 3. 自動登録を待つ

サーバーは 60 秒ごとに `haystack/` をスキャンします。各フォルダは:

1. フォルダ名からメタデータを抽出
2. `unread` (未読) としてデータベースに登録
3. `haystack/` から `unread/` に移動

同名のコミックがすでに登録済みの場合は `duplicates/` に移動されます。

`POST /api/register` で即座に登録を実行することもできます。

### 4. 閲覧して評価する

ブラウザで Web UI を開き、`unread` の本棚からコミックを選んで閲覧します。星マークをクリックして評価すると、対応する本棚に自動で移動します:

| 星 | 本棚 |
|----|------|
| 1 | hold (保留) |
| 2 | like (良い) |
| 3 | favorite (お気に入り) |
| 4 | love (とても好き) |
| 5 | legend (殿堂入り) |

## 詳細ドキュメント

- [Docker Compose](docs/docker-compose.md) — Docker Compose でのデプロイ方法
- [リバースプロキシ設定](docs/reverse-proxy.md) — Nginx 等でサブパス配下にデプロイする方法
- [開発ガイド](docs/development.md) — ローカルでの開発・ビルド方法
- [API リファレンス](docs/api.md) — REST API の仕様
