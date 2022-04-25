import type { GetPageResponse } from '@notionhq/client/build/src/api-endpoints'
import type { U } from 'ts-toolbelt'

export function uuidFromID(id: string | null | undefined): string {
  return id?.replace(/-/g, '') ?? ''
}

type Properties = U.Merge<GetPageResponse>['properties']
type Property = U.NonNullable<Properties[keyof Properties]>
type Types = Property['type']
type File = {
  url: string
  name: string
}

export function getProperty<
  Props extends Record<string, { type?: string }>,
  Prop extends Props[keyof Props],
  Type extends Prop['type'],
  Res extends Extract<Prop, { type: Type }>,
  TypeKey extends Extract<keyof Res, Type>,
>(
  props: Props | null | undefined,
  key: keyof Props,
  type: Type,
): Res[TypeKey] | null {
  return props && key in props
    ? (props[key] as Res)?.[type as TypeKey] || null
    : null
}

export function richTextToPlainText(
  richText:
    | Extract<Property, { type: 'rich_text' }>['rich_text']
    | null
    | undefined,
): string | null {
  return (
    richText?.reduce((res, cur) => `${res}${cur?.plain_text ?? ''}`, '') ?? null
  )
}

export function getFile(
  files: Extract<Property, { type: 'files' }>['files'] | null | undefined,
): Array<File> {
  return (files || []).reduce<Array<File>>((res, item) => {
    switch (item.type) {
      case 'external':
        res.push({ url: item.external.url, name: item.name })
        break
      case 'file':
        res.push({ url: item.file.url, name: item.name })
        break

      default:
        break
    }
    return res
  }, [])
}
