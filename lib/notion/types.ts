declare type TextRequest = string

export type Annotations = {
  bold: boolean
  italic: boolean
  strikethrough: boolean
  underline: boolean
  code: boolean
  color:
    | 'default'
    | 'gray'
    | 'brown'
    | 'orange'
    | 'yellow'
    | 'green'
    | 'blue'
    | 'purple'
    | 'pink'
    | 'red'
    | 'gray_background'
    | 'brown_background'
    | 'orange_background'
    | 'yellow_background'
    | 'green_background'
    | 'blue_background'
    | 'purple_background'
    | 'pink_background'
    | 'red_background'
}

export type Text = {
  id: string
  type: 'text'
  text: {
    content: string
    link: {
      url: TextRequest
    } | null
  }
  annotations: Annotations
  plain_text: string
  href: string | null
}

export type Mention = {
  id: string
  type: 'mention'
  mention:
    | {
        type: 'page'
        page: {
          id: TextRequest
        } | null
      }
    | {
        type: 'database'
        database: {
          id: TextRequest
        } | null
      }
  annotations: Annotations
  plain_text: string
  href: string | null
}

export type Title = {
  id: string
  type: 'title'
  title: Array<Text>
}

export type RichText = {
  id: string
  type: 'rich_text'
  rich_text: Array<Text>
}

export type RichTextWithMention = {
  id: string
  type: 'rich_text'
  rich_text: Array<Text | Mention>
}

export type Date = {
  id: string
  type: 'date'
  date: {
    start: string | null
    end: string | null
  }
}

export type Relation = {
  id: string
  type: 'relation'
  relation: Array<{
    id: string
  }>
}

export type Files = {
  id: string
  type: 'files'
  files: Array<{
    name: string
    type: 'file'
    file: {
      url: string
      expiry_time: string
    }
  }>
}

export type Select = {
  id: string
  type: 'select'
  select: {
    id: string
    name: string
    color: string
  }
}

export type ObjectWithID = {
  id: string
}
