# comic-server

自分のコミックコレクションをブラウザで管理・閲覧できるサーバーです。

画像フォルダを指定するだけで、本棚のように分類・レビューしながら読むことができます。

## Quick Start (Docker)

```bash
docker run -p 3000:3000 -v /path/to/comics:/comics -e COMIC_PATH=/comics ghcr.io/miyabisun/comic-server:latest
```

ブラウザで `http://localhost:3000` を開く。

## Quick Start (Bun)

```bash
bun install && bun run build:client
COMIC_PATH=/path/to/comics bun start
```

ブラウザで `http://localhost:3000` を開く。

> Nginx でサブパス配下にデプロイする場合は [リバースプロキシ設定](docs/reverse-proxy.md) を参照。

## 環境変数

現行の変数・必須条件・未設定時の既定値・不正値の扱いは
[README.md の環境変数一覧](README.md#environment-variables)を正本とする。
サーバー設定と、画像処理スクリプト・OS の実行環境を分けて掲載している。
`bun start` は `.env` を読み込み、Docker では `environment` / `-e` で渡す。
`COMIC_PATH` とボリュームのマウント先を一致させ、DB の親ディレクトリを先に用意する。

## フォルダ構成

`COMIC_PATH` に指定したフォルダの中に、本棚ごとのサブフォルダを配置します。
各コミックは PNG/JPEG 画像を含むフォルダです。

`/images/*` は解決後のファイルの拡張子と先頭署名を確認し、PNG/JPEGだけを配信します。COMIC_PATH外、非公開の `.remaster` 作業領域、DBなどの非画像ファイルはsymlink経由も含めて拒否します。画像は再エンコードせず配信します。

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

### 3. API で登録する

`haystack/` にフォルダを配置したら、登録 API にフォルダ名を指定して呼び出します:

```bash
curl -X POST http://localhost:3000/api/regist \
  -H 'Content-Type: application/json' \
  -d '{"name": "(同人誌) [サークル名] 作品タイトル (原作名)"}'
```

各フォルダは:

1. フォルダ名からメタデータを抽出
2. `unread` (未読) としてデータベースに登録
3. `haystack/` から `unread/` に移動

同名のコミックがすでに登録済みの場合は `duplicates/` に移動されます。

### 4. 閲覧して評価する

ブラウザで Web UI を開き、`unread` の本棚からコミックを選んで閲覧します。星マークをクリックして評価すると、対応する本棚に自動で移動します:

| 星 | 本棚 |
|----|------|
| 1 | hold (保留) |
| 2 | like (良い) |
| 3 | favorite (お気に入り) |
| 4 | love (とても好き) |
| 5 | legend (殿堂入り) |

## リマスター

コミック情報の「リマスターを開始」で、原本を残した「リマスター版」を別作品として作成する。
MangaJaNai（白黒）とIllustrationJaNai（カラー）をRust製CLIからONNX Runtime CPU版で実行する。
Docker版には実行ファイル・外部モデル・推論ライブラリを同梱する。
[セットアップと制限](README.md#remaster-mangajanai)、[品質・性能の検証](docs/remaster-validation.md)を参照。

自作コードは利用者指定の配布方針により[CC BY-NC 4.0](LICENSE)。採用するV1モデルは
**CC BY-NC-SA 4.0**を保持し、各依存のライセンスとも区別する。
[第三者の帰属・バージョン・条件](README.md#license-and-third-party-attribution)を正本とする。

## 詳細ドキュメント

- [Docker Compose](docs/docker-compose.md) — Docker Compose でのデプロイ方法
- [リバースプロキシ設定](docs/reverse-proxy.md) — Nginx 等でサブパス配下にデプロイする方法
- [開発ガイド](docs/development.md) — ローカルでの開発・ビルド方法
- [API リファレンス](docs/api.md) — REST API の仕様

## 一覧のブラウザ回帰検証

```sh
bun install --frozen-lockfile
bunx playwright install --with-deps chromium
bun run test:e2e
```

テストは一時SQLiteと画像フォルダを作り、127.0.0.1:5190で実APIとビルド済みUIを起動します。
設定済みのライブラリは使用せず、終了時に一時データを削除します。Bunによる通常テストとの
混在を避け、Playwrightの対象は `e2e/*.pw.js` としています。
本棚・ブランドの表示領域、ページスクロール、明暗・狭幅、キーボード、分類・削除・一括確認、
読書後と再読込時の位置復元を検証します。測定基準と実装の所有箇所はroot DESIGN.mdにあります。
