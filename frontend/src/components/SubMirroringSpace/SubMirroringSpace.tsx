// E:\3_CODING\Personally\english_practice\frontend\src\components\SubMirroringSpace\SubMirroringSpace.tsx 
import React from "react";
import MirroringSpace, {
    type MirroringSpaceProps,
} from "../MirroringSpace/MirroringSpace";

// Giữ nguyên giao diện & hành vi như MirroringSpace.
// Chỉ khác: buộc dùng stateKind="submirror" để đọc store phụ.
export type SubMirroringSpaceProps = Omit<
    MirroringSpaceProps,
    "stateKind" | "renderToken"
>;

/**
 * SubMirroringSpace — bản sao 1:1 của MirroringSpace,
 * chỉ khác stateKind để dùng store submirror.
 */
export default function SubMirroringSpace(props: SubMirroringSpaceProps) {
    return <MirroringSpace {...props} stateKind="submirror" />;
}
