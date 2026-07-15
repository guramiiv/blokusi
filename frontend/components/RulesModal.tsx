"use client";

// Game rules modal (in Georgian), shared by the lobby and the game page.

function ExampleBoard({
  cells,
  marks,
  w = 7,
  h = 5,
}: {
  cells: Record<string, string>;
  marks?: Record<string, "ok" | "bad">;
  w?: number;
  h?: number;
}) {
  return (
    <div
      className="ex-board"
      style={{ gridTemplateColumns: `repeat(${w}, 18px)` }}
    >
      {Array.from({ length: h }, (_, y) =>
        Array.from({ length: w }, (_, x) => {
          const k = `${x},${y}`;
          return (
            <div
              key={k}
              className={`ex-cell ${cells[k] ?? ""} ${
                marks?.[k] ? `mark-${marks[k]}` : ""
              }`}
            />
          );
        })
      )}
    </div>
  );
}

// legal: second blue piece touches the first only at a corner;
// the yellow piece may touch blue along an edge (different colors).
const EX_OK_CELLS: Record<string, string> = {
  "0,0": "blue", "1,0": "blue", "0,1": "blue",
  "2,1": "blue", "3,1": "blue", "3,2": "blue",
  "0,2": "yellow", "0,3": "yellow", "1,3": "yellow",
};
const EX_OK_MARKS: Record<string, "ok" | "bad"> = {
  "1,0": "ok", "2,1": "ok",
};

// illegal: second blue piece shares an edge with the first.
const EX_BAD_CELLS: Record<string, string> = {
  "0,0": "blue", "1,0": "blue", "0,1": "blue",
  "2,0": "blue", "3,0": "blue", "3,1": "blue",
};
const EX_BAD_MARKS: Record<string, "ok" | "bad"> = {
  "1,0": "bad", "2,0": "bad",
};

export default function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card rules-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>📖 თამაშის წესები</h2>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="rules-content">
          <h3>მიზანი</h3>
          <p>
            მოათავსე დაფაზე რაც შეიძლება მეტი ფიგურა შენი 21 ფიგურიდან.
            იმარჯვებს ის, ვინც ყველაზე მეტ ქულას დააგროვებს.
          </p>

          <h3>ძირითადი წესები</h3>
          <ul>
            <li>
              თამაშობს 4 მოთამაშე, თითოეულს აქვს 21 ფიგურა. სვლების რიგი:{" "}
              <strong>ლურჯი → ყვითელი → წითელი → მწვანე</strong>.
            </li>
            <li>
              პირველი ფიგურა აუცილებლად უნდა ფარავდეს შენს{" "}
              <strong>საწყის კუთხეს</strong> (დაფაზე მონიშნულია შენი ფერით).
            </li>
            <li>
              ყოველი შემდეგი ფიგურა შენივე ფერის ფიგურას უნდა ეხებოდეს{" "}
              <strong>მხოლოდ კუთხით</strong> — გვერდით შეხება იმავე ფერთან
              აკრძალულია.
            </li>
            <li>სხვა ფერის ფიგურებთან შეხება შეზღუდული არ არის.</li>
            <li>დადებული ფიგურა აღარ იძვრის.</li>
            <li>
              თუ სვლა ვეღარ გაქვს, ავტომატურად გამოგტოვებენ. თამაში
              მთავრდება, როცა ვეღარავინ დებს ფიგურას.
            </li>
          </ul>

          <div className="example-boards">
            <div className="ex-item">
              <ExampleBoard cells={EX_OK_CELLS} marks={EX_OK_MARKS} />
              <p className="ex-cap ex-ok">
                ✓ სწორია — ლურჯი ფიგურები მხოლოდ <strong>კუთხით</strong>{" "}
                ეხებიან (ყვითელს გვერდით შეხება შეუძლია)
              </p>
            </div>
            <div className="ex-item">
              <ExampleBoard cells={EX_BAD_CELLS} marks={EX_BAD_MARKS} />
              <p className="ex-cap ex-bad">
                ✕ არასწორია — ერთი ფერის ფიგურები <strong>გვერდით</strong>{" "}
                ეხებიან
              </p>
            </div>
          </div>

          <h3>ქულები</h3>
          <ul>
            <li>
              დარჩენილი ფიგურების ყოველი კვადრატი = <strong>−1 ქულა</strong>
            </li>
            <li>
              ყველა ფიგურის დადება = <strong>+15 ქულა</strong>
            </li>
            <li>+5 დამატებით, თუ ბოლოს ერთკვადრატიანი ფიგურა დადე</li>
          </ul>

          <h3>როგორ ვითამაშო</h3>
          <ul>
            <li>
              ლობიში შექმენი თამაში ან შეუერთდი არსებულს — თამაში
              ავტომატურად იწყება, როცა 4 მოთამაშე შეიკრიბება.
            </li>
            <li>
              აირჩიე ფიგურა შენი ფიგურების პანელიდან (მობილურზე —{" "}
              <strong>„➕ Add piece“</strong> ღილაკით) და დადე დაფაზე.
            </li>
            <li>
              დააჭირე შენს უკვე დადებულ ფიგურას დაფაზე — გაიხსნება ფიგურის
              არჩევის ფანჯარა და ახალი ფიგურა მის გვერდით დაიდება.
            </li>
            <li>
              გადაათრიე ფიგურა სასურველ ადგილას:{" "}
              <strong>მწვანე ჩარჩო</strong> ნიშნავს, რომ პოზიცია სწორია,
              წითელი — რომ იქ დადება არ შეიძლება.
            </li>
            <li>
              მოაბრუნე ან შეაბრუნე ფიგურა ღილაკებით (კომპიუტერზე — R და F
              კლავიშებით), შემდეგ დაადასტურე <strong>✓</strong> ღილაკით.
            </li>
            <li>
              მოწინააღმდეგის დარჩენილი ფიგურების სანახავად დააჭირე მის
              სახელს თამაშის გვერდზე.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
