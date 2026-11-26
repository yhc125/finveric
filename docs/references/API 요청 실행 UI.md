# API 요청 실행 UI 참고 사례

2026-11-26 · 공식 API 문서와 공개 데모 확인

FINVERIC의 공개 연동 문서는 API 11개의 설명과 코드 예시를 제공한다. 현재 요청 양식은 설명 아래에서 펼친다. 양식을 열면 설명과 필드 정의가 아래로 밀린다. 코드 예시, 실제 요청, 응답 예시가 여러 위치에 있어 한 API를 읽고 실행할 때 시선이 오간다.

## 확인한 화면

| 사례 | 화면에서 확인한 배치 | FINVERIC에 참고할 점 |
| --- | --- | --- |
| Scalar Galaxy | 왼쪽에서 경로를 고른다. 가운데에 경로 값과 응답을 설명한다. 오른쪽 코드 카드의 **Test Request**를 누르면 요청 편집기가 열린다. 편집기 상단에 메서드·URL·전송 버튼이 있고 아래 왼쪽에 입력, 오른쪽에 응답이 있다. [Get a planet](https://galaxy.scalar.com/#scalar-galaxy/tag/planets/GET/planets/%7BplanetId%7D) | 설명을 읽는 화면에서 입력란이 차지하는 높이를 줄인다. 실행으로 전환할 때 현재 경로를 유지한다. |
| ReadMe | 가운데에 API 설명을 둔다. 오른쪽에 언어 선택, 코드 예시, **Try It!**, 응답을 위에서 아래로 배치한다. 응답 영역은 전송 전에도 위치를 유지한다. [Outbound IP 주소 조회](https://docs.readme.com/main/reference/getoutboundips) | 실행 버튼 바로 아래에서 응답을 찾을 수 있다. 기존 문서 구조에 적용할 수 있다. |
| Redocly Replay | 메서드, URL, **Send**가 한 줄에 있다. POST 예시에는 편집 가능한 JSON이 들어 있다. 공개 모의 서버의 GET 응답에서 상태, 소요 시간, 본문 탭과 복사 기능을 확인했다. [Replay 예제](https://redocly.com/learn/markdoc/tags/replay-openapi#examples) | 전송할 주소와 메서드를 한곳에서 확인한다. 응답 본문을 상태와 같이 보여 준다. FINVERIC의 필수 입력은 탭 전환 없이 같은 영역에 둔다. |
| Swagger UI | 상단 **Authorize**가 API 키를 받는다. API의 **Try it out**을 누르면 경로 값과 **Execute**가 열린다. 공개 GET에서 나온 `404`와 본문을 **Server response**에 표시했다. 문서에 정의한 응답은 **Responses**에 따로 보인다. [Petstore](https://petstore.swagger.io/#/pet/getPetById) | API 키를 한 번 입력하는 흐름과 실제 응답의 이름을 참고한다. |

## FINVERIC 적용 제안

- 넓은 화면은 왼쪽 목차, 가운데 설명, 오른쪽 요청 패널로 구성한다. 오른쪽 상단의 **코드 예시**와 **직접 실행**으로 작업을 전환한다.
- **직접 실행**의 첫 줄에는 메서드, 실제 요청 URL, **보내기**를 둔다. API 키는 문서 전체에서 한 번 연결한다. 선택한 API에 필요한 경로 값과 본문만 표시한다. POST에서 본문을 받으면 예시 JSON을 편집기에 채운다.
- **실제 응답** 제목 아래에 상태 코드와 본문을 표시한다. 문서에 정의한 응답 예시는 **코드 예시**에서 확인한다. 응답 전에는 실행 결과가 표시될 위치를 짧게 안내한다.
- 좁은 화면은 선택한 API의 설명 아래에 요청 패널을 한 열로 배치한다.
